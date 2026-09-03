import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
assert.ok(!html.includes('\uFFFD'),'source must be valid UTF-8')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'timegrid-syntax-'))
try{
  let count=0
  for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/\bsrc\s*=|application\/ld\+json|application\/json/.test(match[1]))continue
    const file=path.join(dir,`inline-${++count}.mjs`);fs.writeFileSync(file,match[2])
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true})
    assert.equal(result.status,0,result.stderr)
  }
  const sw=spawnSync(process.execPath,['--check',new URL('../sw.js',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')],{encoding:'utf8',windowsHide:true})
  assert.equal(sw.status,0,sw.stderr)
  console.log(`${count} inline scripts and service worker passed node --check; U+FFFD=0`)
}finally{
  const resolved=path.resolve(dir)
  assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith('timegrid-syntax-'))
  fs.rmSync(resolved,{recursive:true,force:true})
}
