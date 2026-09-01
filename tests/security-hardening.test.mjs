import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const firestoreRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8")
const start = html.indexOf("/* SETTINGS_COLOR_CORE_START */")
const end = html.indexOf("/* SETTINGS_COLOR_CORE_END */")
assert.ok(start >= 0 && end > start, "settings color core markers must exist")

const context = { console, JSON, Map, Object, String, Array, RegExp }
vm.createContext(context)
vm.runInContext(html.slice(start, end) + "\n;globalThis.__colors=TG_SETTINGS_COLORS;", context)
const colors = context.__colors

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1])
assert.equal(inlineScripts.length, 1, "the single-file app must expose exactly one inline application script")
new vm.Script(inlineScripts[0], { filename: "index.inline.js" })

const payload = '\" onmouseover=\"globalThis.__storedXss=1'
const normalized = colors.normalize({
  version: 2,
  areas: [
    { name: "unsafe", color: payload },
    { name: "short", color: "#abc" },
  ],
  activities: [
    { id: "a1", name: "unsafe activity", area: "unsafe", color: "red;position:fixed" },
    { id: "a2", name: "short activity", area: "short", color: "#00ff7f" },
  ],
})

for (const item of [...normalized.areas, ...normalized.activities]) {
  assert.match(item.color, /^#[0-9A-F]{6}$/, "every persisted color must be canonical #RRGGBB")
  assert.doesNotMatch(item.color, /[\"'<>;=]/, "normalized colors cannot escape an HTML style attribute")
}
assert.equal(normalized.areas[0].color, "#E03131", "invalid area colors use a deterministic palette fallback")
assert.equal(normalized.areas[1].color, "#AABBCC", "legacy #RGB colors expand to canonical #RRGGBB")
assert.equal(normalized.activities[0].color, "#E03131", "invalid activity colors inherit their normalized area color")
assert.equal(normalized.activities[1].color, "#00FF7F")

assert.match(html, /if\(s\.settings\) state\.settings=normalizeSettingsColors\(s\.settings\)/, "local storage settings are normalized on load")
assert.match(html, /const importedSettings=normalizeSettingsColors\(json\.settings\)/, "backup settings are normalized before replace or merge")
assert.match(html, /function normSettings\(s\)\{\s*s=normalizeSettingsColors\(s\|\|\{\}\)/, "remote settings are normalized before merge")

const rawColorSinks = html.split(/\r?\n/).filter(line => /innerHTML\s*=/.test(line) && /\.color/.test(line))
assert.ok(rawColorSinks.length > 0, "the sink audit must cover actual color-bearing HTML templates")
for (const line of rawColorSinks) {
  assert.match(line, /safeHexColor\(|hexToRgba\(|areaColor\(/, "color-bearing innerHTML templates must pass through a color sanitizer")
}

const externalScripts = [...html.matchAll(/<script\s+src="https:[^"]+"[^>]*><\/script>/g)].map(match => match[0])
assert.equal(externalScripts.length, 4, "all four pinned CDN scripts are covered")
for (const tag of externalScripts) {
  assert.match(tag, /integrity="sha384-[A-Za-z0-9+/]+={0,2}"/, "external scripts require SHA-384 integrity")
  assert.match(tag, /crossorigin="anonymous"/, "SRI scripts require anonymous CORS mode")
}

assert.doesNotMatch(html, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "the public client source must not contain an owner email allowlist")
assert.doesNotMatch(firestoreRules, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "public Firestore rules must not expose an owner email")
assert.match(html, /OWNER_CLAIM="timegridOwner"/, "the client must require the private owner role claim")
assert.match(html, /getIdTokenResult\(true\)/, "the client must refresh its token when the owner claim is not cached")
assert.match(firestoreRules, /request\.auth\.token\.timegridOwner == true/, "Firestore rules must enforce the owner role claim")
assert.match(firestoreRules, /request\.auth\.uid == uid/, "the owner claim must remain scoped to the signed-in user's own path")

console.log("security hardening tests passed")
