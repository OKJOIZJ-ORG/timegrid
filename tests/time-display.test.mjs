import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
const start = html.indexOf("/* TIME_DISPLAY_CORE_START */")
const end = html.indexOf("/* TIME_DISPLAY_CORE_END */")
assert.ok(start >= 0 && end > start, "time display core markers must exist")

const context = { Number, String, Math }
vm.createContext(context)
vm.runInContext(html.slice(start, end) + "\n;globalThis.__time=TG_TIME_DISPLAY;", context)
const time = context.__time

assert.equal(time.clock(191.04699999999997), "00:03:11", "fractional binary tails never reach the clock")
assert.equal(time.clock(0.999), "00:00:00", "the live clock advances only on completed seconds")
assert.equal(time.clock(36 * 3600 + 61), "36:01:01", "long sessions retain hours beyond one day")
assert.equal(time.clock(-1), "00:00:00", "negative durations are clamped")
assert.equal(time.clock(Number.NaN), "00:00:00", "invalid durations are clamped")
assert.equal(time.elapsed(1_000, 192_046.999), 191, "active session elapsed time uses the same whole-second contract")
assert.equal(time.elapsed(10_000, 9_000), 0, "future start timestamps do not produce negative elapsed time")

assert.match(html, /id="runElapsed">00:00:00<\/span> 경과/, "the active-session chip exposes its own elapsed clock")
assert.match(html, /setInterval\(\(\)=>\{renderTotal\(\); renderActiveElapsed\(\);/, "the active-session clock updates on the existing one-second ticker")
assert.match(html, /const liveSec=rb\? TG_TIME_DISPLAY\.wholeSeconds\(rb\.re-rb\.rs\) : 0/, "sub-minute entity badges cannot leak fractional seconds")

console.log("time display tests passed")
