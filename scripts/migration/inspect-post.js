#!/usr/bin/env node
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getPayloadClient } from './lib/payload-client.js'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '.env') })

async function main() {
  const client = await getPayloadClient()
  const id = process.argv[2] || '821'
  
  console.log(`Inspecting post ID: ${id}`)
  
  const doc = await client.http.get(`/posts/${id}?locale=all&depth=0`)
  console.log(JSON.stringify(doc.data, null, 2))
}

main().catch(err => {
  console.error(err.message)
  if (err.response) {
      console.error(JSON.stringify(err.response.data, null, 2))
  }
})
