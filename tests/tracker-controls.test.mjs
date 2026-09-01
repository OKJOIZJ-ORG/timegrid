import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")

assert.doesNotMatch(html, /#actInput\{[^}]*field-sizing:content/, "activity width has one JS authority instead of competing CSS sizing")
assert.match(html, /const tw=Math\.ceil\(_actMeas\.getBoundingClientRect\(\)\.width\)\+\(hasVal\?4:0\)/, "activity sizing reserves iOS subpixel glyph width")
assert.match(html, /function paintActInput\(animate\)[\s\S]*?paintSwReady\(\);[\s\S]*?sizeActInput\(animate!==false\);/, "activity input is measured after its final font weight is painted")
assert.match(html, /document\.fonts\.ready\.then\(function\(\)\{paintActInput\(false\);\}\)/, "activity width is remeasured after font readiness")
assert.match(html, /classList\.add\("tmr-play"\)[\s\S]*?createElementNS\(icon\.namespaceURI,"path"\)/, "timer play controls use deterministic SVG geometry")
assert.match(html, /classList\.add\("tmr-stop"\)[\s\S]*?createElementNS\(icon\.namespaceURI,"rect"\)/, "timer stop controls use centered SVG geometry")

console.log("tracker control contract tests passed")
