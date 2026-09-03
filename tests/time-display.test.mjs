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

const context = { Number, String, Math, Date }
vm.createContext(context)
vm.runInContext(html.slice(start, end) + "\n;globalThis.__time=TG_TIME_DISPLAY;", context)
const time = context.__time

assert.equal(time.clock(191.04699999999997), "00:03:11", "fractional binary tails never reach the clock")
assert.equal(time.clock(0.999), "00:00:00", "the live clock advances only on completed seconds")
assert.equal(time.clock(36 * 3600 + 61), "36:01:01", "long sessions retain hours beyond one day")
assert.equal(time.clock(-1), "00:00:00", "negative durations are clamped")
assert.equal(time.clock(Number.NaN), "00:00:00", "invalid durations are clamped")
assert.equal(time.compact(24), "24s", "short active sessions use compact unit text")
assert.equal(time.compact(8 * 60 + 38), "8m 38s", "active sessions expose minutes and seconds without clock chrome")
assert.equal(time.compact(3600 + 2 * 60 + 3), "1h 2m 3s", "long active sessions expose hours, minutes, and seconds")
assert.equal(time.elapsed(1_000, 192_046.999), 191, "active session elapsed time uses the same whole-second contract")
assert.equal(time.elapsed(10_000, 9_000), 0, "future start timestamps do not produce negative elapsed time")
const boundaryStart = new Date(2026, 8, 2, 12, 0, 0, 125).getTime()
const boundaryNow = new Date(2026, 8, 2, 12, 0, 2, 75).getTime()
assert.equal(
  time.wholeSeconds(time.daySecond(boundaryNow) - time.daySecond(boundaryStart)),
  time.elapsed(boundaryStart, boundaryNow),
  "daily total and active-session elapsed clocks share the same millisecond boundary",
)

assert.match(html, /id="runElapsed">0s<\/span> 경과/, "the active-session chip exposes its own compact elapsed duration")
assert.doesNotMatch(html, /id="runName"|id="runDot"/, "the running status must not repeat the selected activity identity")
assert.match(html, /TG_TIME_DISPLAY\.compact\(TG_TIME_DISPLAY\.elapsed/, "the active-session status uses the compact unit formatter")
assert.match(html, /setInterval\(\(\)=>\{renderTotal\(\); renderActiveElapsed\(\);/, "the active-session clock updates on the existing one-second ticker")
const badge={textContent:''}
const badgeContext={state:{running:{todoId:'t'},viewDate:'2026-09-03'},TG_TIME_DISPLAY:time,
  document:{querySelectorAll:()=>[badge]},ensureDay:()=>({todos:[{id:'t'}]}),
  todoMeasuredMin:()=>20.999/60,fmtShort:minutes=>'minutes:'+minutes}
vm.createContext(badgeContext)
vm.runInContext(html.slice(html.indexOf('function tickTmrBadges(){'),html.indexOf('let lkTarget=null')),badgeContext)
badgeContext.tickTmrBadges();assert.equal(badge.textContent,'20s','projected sub-minute badges floor fractional seconds')
badgeContext.todoMeasuredMin=()=>70/60
badgeContext.tickTmrBadges();assert.equal(badge.textContent,'minutes:'+70/60,'projected duration includes live time exactly once')
assert.match(html,/ctx\.fillText\("총 기록 "\+TG_TIME_DISPLAY\.compact\(total\*60\)/,'PNG header shares whole-second formatting')
assert.match(html, /rs=TG_TIME_DISPLAY\.daySecond\(r\.startTs\)/, "running daily bounds retain start milliseconds")
assert.match(html, /re=TG_TIME_DISPLAY\.daySecond\(now\.getTime\(\)\)/, "running daily bounds retain current milliseconds")

console.log("time display tests passed")
