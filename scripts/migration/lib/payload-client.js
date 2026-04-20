// Minimal Payload REST client used by migration scripts.
//
// Auth: POST /users/login → { token } (JWT). Sent as `Authorization: JWT <token>`.
// Ref: https://payloadcms.com/docs/authentication/overview
//
// DRY_RUN=1 short-circuits every write. GETs still hit the API so we can
// check existing documents, verify taxonomy slug uniqueness, etc. Writes
// are logged to stdout and return a deterministic fake id (`dry:<counter>`).

import axios from 'axios'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const RETRY_ATTEMPTS = parseInt(process.env.PAYLOAD_RETRY_ATTEMPTS || '4', 10)
const RETRY_BASE_MS = parseInt(process.env.PAYLOAD_RETRY_BASE_MS || '500', 10)

let _client = null
let _dryCounter = 0

export function isDryRun() {
  return DRY_RUN
}

async function requestWithRetry(fn, label) {
  let lastErr
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fn()
      if (shouldRetryStatus(res?.status) && attempt < RETRY_ATTEMPTS) {
        const waitMs = backoffMs(attempt)
        console.warn(`  ↻ ${label} got ${res.status}; retry ${attempt}/${RETRY_ATTEMPTS - 1} in ${waitMs}ms`)
        await sleep(waitMs)
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      if (!shouldRetryError(err) || attempt >= RETRY_ATTEMPTS) {
        throw err
      }
      const waitMs = backoffMs(attempt)
      console.warn(`  ↻ ${label} transient error (${err.code || err.message}); retry ${attempt}/${RETRY_ATTEMPTS - 1} in ${waitMs}ms`)
      await sleep(waitMs)
    }
  }
  throw lastErr
}

function shouldRetryStatus(status) {
  return status === 429 || (status >= 500 && status < 600)
}

function shouldRetryError(err) {
  const code = err?.code
  return code === 'ECONNABORTED' || code === 'ECONNRESET' || code === 'ETIMEDOUT'
}

function backoffMs(attempt) {
  return RETRY_BASE_MS * Math.pow(2, attempt - 1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getPayloadClient() {
  if (_client) return _client

  const baseURL = (process.env.PAYLOAD_API_URL || '').replace(/\/$/, '')
  const email = process.env.PAYLOAD_EMAIL
  const password = process.env.PAYLOAD_PASSWORD
  if (!baseURL) throw new Error('PAYLOAD_API_URL not set in .env')

  const http = axios.create({
    baseURL,
    timeout: 60_000,
    validateStatus: (s) => s < 600, // surface 4xx/5xx bodies to caller
    // Payload REST expects nested `where` clauses serialized with square
    // brackets (e.g. `where[slug][equals]=foo`). Axios' default serializer
    // produces `where=[object Object]`, causing 500s. Flatten manually.
    paramsSerializer: { serialize: serializeParams },
  })

  // In DRY_RUN we skip auth entirely — no writes will occur, no reads are
  // made (see `find` override below). Avoids triggering Payload's login
  // rate-limit lockout (maxLoginAttempts=5, 10min) during iterative runs.
  if (!DRY_RUN) {
    if (!email || !password) {
      throw new Error('PAYLOAD_EMAIL and PAYLOAD_PASSWORD must be set in .env')
    }
    console.log(`→ Authenticating to ${baseURL} as ${email}...`)
    const loginRes = await http.post('/users/login', { email, password })
    if (loginRes.status !== 200 || !loginRes.data?.token) {
      throw new Error(
        `Login failed (${loginRes.status}): ${JSON.stringify(loginRes.data).slice(0, 300)}`,
      )
    }
    console.log(`  ✓ authenticated as ${loginRes.data.user?.email}`)
    http.defaults.headers.common['Authorization'] = `JWT ${loginRes.data.token}`
  } else {
    console.log(`→ DRY_RUN: skipping login to ${baseURL}`)
  }
  http.defaults.headers.common['Content-Type'] = 'application/json'

  _client = {
    http,
    async find(collection, params = {}) {
      // In DRY_RUN mode, skip the network entirely and pretend nothing exists.
      // This lets the migration exercise its create/update paths end-to-end
      // without depending on the CMS being reachable (or healthy).
      if (DRY_RUN) {
        return { docs: [], totalDocs: 0, _dry: true }
      }
      const r = await requestWithRetry(() => http.get(`/${collection}`, { params }), `GET /${collection}`)
      if (r.status !== 200) {
        throw new Error(`GET /${collection} failed (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`)
      }
      return r.data
    },
    async create(collection, data, { locale } = {}) {
      if (DRY_RUN) {
        _dryCounter++
        console.log(`  [dry] POST /${collection}${locale ? `?locale=${locale}` : ''} →`, summarize(data))
        return { id: `dry:${_dryCounter}`, ...data }
      }
      const r = await requestWithRetry(
        () => http.post(`/${collection}`, data, { params: locale ? { locale } : {} }),
        `POST /${collection}`,
      )
      if (r.status !== 201 && r.status !== 200) {
        throw new Error(
          `POST /${collection} failed (${r.status}): ${JSON.stringify(r.data).slice(0, 400)}`,
        )
      }
      return r.data.doc || r.data
    },
    async update(collection, id, data, { locale } = {}) {
      if (DRY_RUN) {
        console.log(`  [dry] PATCH /${collection}/${id}${locale ? `?locale=${locale}` : ''} →`, summarize(data))
        return { id, ...data }
      }
      const r = await requestWithRetry(
        () => http.patch(`/${collection}/${id}`, data, { params: locale ? { locale } : {} }),
        `PATCH /${collection}/${id}`,
      )
      if (r.status !== 200) {
        throw new Error(
          `PATCH /${collection}/${id} failed (${r.status}): ${JSON.stringify(r.data).slice(0, 400)}`,
        )
      }
      return r.data.doc || r.data
    },
  }
  return _client
}

function summarize(data) {
  // Trim noisy fields so dry-run output stays readable.
  const copy = { ...data }
  if (copy.content && typeof copy.content === 'object') {
    const n = countLexicalChildren(copy.content)
    copy.content = `<lexical root, ${n} top-level children>`
  }
  for (const k of Object.keys(copy)) {
    if (typeof copy[k] === 'string' && copy[k].length > 120) {
      copy[k] = copy[k].slice(0, 117) + '...'
    }
  }
  return copy
}

function countLexicalChildren(v) {
  try {
    return v?.root?.children?.length ?? 0
  } catch {
    return 0
  }
}

/**
 * Serialize nested objects into PHP-style bracket notation for query strings,
 * matching qs.stringify's default behavior. Handles objects and primitives;
 * arrays are encoded as repeated `key[]=v`. Booleans/numbers are stringified.
 */
function serializeParams(params) {
  const parts = []
  function walk(prefix, value) {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      for (const v of value) walk(`${prefix}[]`, v)
      return
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        walk(`${prefix}[${k}]`, v)
      }
      return
    }
    parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
  }
  for (const [k, v] of Object.entries(params || {})) walk(k, v)
  return parts.join('&')
}
