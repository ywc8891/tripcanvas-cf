export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const host = url.hostname

    // Map subdomain to locale
    const localeMap: Record<string, string> = {
      'malaysia.tripcanvas.co': 'my',
      'indonesia.tripcanvas.co': 'id',
      'thailand.tripcanvas.co': 'th',
      'tripcanvas.co': 'en',
      'www.tripcanvas.co': 'en',
    }

    const locale = localeMap[host] ?? 'en'

    // Clone request, add locale header for the frontend to read
    const modifiedRequest = new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers),
        'X-TC-Locale': locale,
        'X-TC-Host': host,
      },
    })

    // Route to Cloudflare Pages frontend
    return fetch(modifiedRequest)
  },
}

interface Env {
  DB: D1Database
  R2: R2Bucket
}
