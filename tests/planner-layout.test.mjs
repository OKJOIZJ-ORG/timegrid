import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")

assert.match(html, /\[hidden\]\{display:none!important;\}/, "semantic hidden state must outrank component display rules")
assert.match(html, /--plan-row-h:48px; --plan-control-h:40px;/, "desktop Planner uses shared row and control geometry tokens")
assert.match(html, /#todoList > \.check-item > input\[type=checkbox\][^}]*justify-self:center/, "mobile Todo checkboxes are centered in their control lane")
assert.match(html, /#routineList\.rt-list > \.rt-row > input\[type=checkbox\][^}]*justify-self:center/, "mobile Routine checkboxes are centered in their control lane")
assert.match(html, /#routineList\.rt-list > \.rt-row > \.rt-meta\{[^}]*grid-template-columns:minmax\(0,1fr\) auto auto/, "mobile Routine metadata distributes across the available width")
assert.match(html, /#routineList\.rt-list > \.rt-row > \.rt-meta > \.rt-dow-tag\{grid-column:3;justify-self:end/, "weekday metadata owns the right edge")
assert.match(html, /\.check-item \.ttime \.ttime-v\{[^}]*place-items:center[^}]*transform:none/, "Todo time ink is centered without a positional transform")
assert.doesNotMatch(html, /\.rt-time \+ \.name\{margin-left:-/, "Planner alignment cannot depend on negative name offsets")
assert.doesNotMatch(html, /#todoList \.check-item input\[type=checkbox\]\{margin-right:/, "Todo checkbox alignment cannot depend on extra margins")
assert.match(html, /class="card planner-card planner-card-todo"/, "Todo card opts into the shared Planner surface contract")
assert.match(html, /class="card planner-card planner-card-routine"/, "Routine card opts into the shared Planner surface contract")
assert.match(html, /\.sn-cloud\{[^}]*border:1px solid var\(--line\)[^}]*background:#fff/, "account sync uses the same bordered surface hierarchy")

console.log("planner layout contract tests passed")
