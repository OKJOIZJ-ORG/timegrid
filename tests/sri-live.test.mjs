import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const scripts = [...html.matchAll(/<script\s+src="(https:[^"]+)"\s+integrity="(sha384-[^"]+)"[^>]*><\/script>/g)]
assert.equal(scripts.length, 4, "all pinned CDN scripts must have an integrity value")

for (const [, url, expected] of scripts) {
  const response = await fetch(url, { cache: "no-store" })
  assert.equal(response.status, 200, `${url} must remain available`)
  assert.equal(response.headers.get("access-control-allow-origin"), "*", `${url} must permit anonymous CORS for SRI`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const actual = "sha384-" + crypto.createHash("sha384").update(bytes).digest("base64")
  assert.equal(actual, expected, `${url} bytes must match the pinned SHA-384 digest`)
}

console.log("live SRI artifact tests passed")
