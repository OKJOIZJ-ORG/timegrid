import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8")

const footerVersion = html.match(/id="sidenavFoot">TimeGrid v(\d+\.\d+\.\d+)/)?.[1]
const cacheVersion = sw.match(/const VERSION = "timegrid-v(\d+\.\d+\.\d+)-\d{8}"/)?.[1]
assert.ok(footerVersion, "the app footer must expose a semantic release version")
assert.ok(cacheVersion, "the service worker must expose a dated semantic cache version")
assert.equal(cacheVersion, footerVersion, "footer and service-worker versions must agree")
assert.equal(footerVersion, "3.13.6", "changed assets require a new service worker cache identity")

console.log("release contract tests passed")
