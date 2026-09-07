import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { detectLocalClis, localCliSelection } from '../src/server/local-cli.ts';
import { ColliderRuntime } from '../src/server/runtime.ts';
import { createHttpServer } from '../src/server/index.ts';
const cwd = resolve(import.meta.dirname, '..');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'local-cli-test-'));
  const binary = join(directory, 'codex'), marker = join(directory, 'logout');
  await writeFile(binary, `#!${process.execPath}\nimport {existsSync} from 'node:fs';\nif(process.argv[2]==='--version')console.log('codex-cli 0.153.4');else if(process.argv[2]==='login')process.exit(existsSync(${JSON.stringify(marker)})?1:0);else process.exit(1);\n`, {mode:0o700});
  const missing = join(directory, 'missing');
  const env = {...process.env, CODEX_CLI_BIN:binary, GROK_CLI_BIN:missing, CLAUDE_CLI_BIN:missing, GEMINI_CLI_BIN:missing};
  const options = {cwd, outputDir:join(directory,'sessions'), demoDelayMs:100, localCli:{env,outputDir:join(directory,'agents')}};
  const runtime = new ColliderRuntime(options); await runtime.init();
  t.after(async () => {await runtime.shutdown(); await rm(directory,{recursive:true,force:true});});
  return {directory,marker,env,options,runtime};
}
test('detects installed executable and local login without exposing output or secrets', async t => {
  const f=await fixture(t), entries=await detectLocalClis({env:f.env});
  assert.equal(entries.find(e=>e.id==='codex').installed,true);
  assert.equal(entries.find(e=>e.id==='codex').login,'logged_in');
  assert.equal(entries.find(e=>e.id==='grok').installed,false);
  assert.equal(entries.find(e=>e.id==='claude').supported,false);
  await writeFile(f.marker,'');
  assert.equal((await detectLocalClis({env:f.env}))[0].login,'not_logged_in');
});
test('only accepts supported identifiers and model names, never client command paths', () => {
  for(const value of [{id:'claude',model:'x'},{id:'codex',model:'x; touch /tmp/bad'},{id:'codex',model:'x',binary:'/tmp/tool'},null]) assert.throws(()=>localCliSelection(value));
  assert.deepEqual(localCliSelection({id:'codex',model:'gpt-5.5'}),{id:'codex',model:'gpt-5.5'});
});
test('switch persists and restores while failed selection leaves current provider and choice intact', async t => {
  const f=await fixture(t);
  const before=await f.runtime.create({mode:'demo',brands:[{id:'a',name:'甲品牌',files:[]},{id:'b',name:'乙品牌',files:[]}],goal:'形成联名概念',constraints:[]});
  const info=await f.runtime.selectLocalCli({id:'codex',model:'gpt-5.5'});
  assert.equal(info.transport,'codex-cli'); assert.equal(info.model,'gpt-5.5');
  assert.deepEqual(f.runtime.get(before.id),before);
  const path=join(f.options.outputDir,'local-cli.json'), saved=await readFile(path,'utf8');
  await assert.rejects(f.runtime.selectLocalCli({id:'grok',model:'grok-4.6'}));
  assert.equal(await readFile(path,'utf8'),saved);assert.equal(f.runtime.info().transport,'codex-cli');
  await f.runtime.shutdown();
  const restored=new ColliderRuntime(f.options);await restored.init();await restored.restoreLocalCli();
  assert.equal(restored.info().model,'gpt-5.5');assert.deepEqual(restored.get(before.id).brands,before.brands);await restored.shutdown();
});
test('running tasks block switching and switching blocks new execution', async t => {
  const f=await fixture(t);
  const switching=f.runtime.selectLocalCli({id:'codex',model:'gpt-5.5'});
  await assert.rejects(f.runtime.create({}),e=>e.status===409);await switching;
  const s=await f.runtime.create({mode:'demo',brands:[{id:'a',name:'甲',files:[]},{id:'b',name:'乙',files:[]}],goal:'合作',constraints:[]});
  await f.runtime.run(s.id);
  await assert.rejects(f.runtime.selectLocalCli({id:'codex',model:'gpt-5.5'}),e=>e.status===409);
  await f.runtime.pause(s.id);await f.runtime.waitForIdle(s.id);
});
test('local HTTP selector supports discovery and rejects cross-site requests', async t => {
  const f=await fixture(t),server=createHttpServer(f.runtime,cwd);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/local-cli')).status,200);
  assert.equal((await fetch(base+'/api/local-cli',{headers:{Origin:'https://evil.example'}})).status,403);
  const response=await fetch(base+'/api/local-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'codex',model:'gpt-5.5'})});
  assert.equal(response.status,200);assert.equal((await response.json()).transport,'codex-cli');
});

test('corrupt saved preference does not prevent startup and can be replaced', async t => {
  const f = await fixture(t);
  await writeFile(join(f.options.outputDir, 'local-cli.json'), '{broken');
  await f.runtime.restoreLocalCli();
  assert.equal(f.runtime.info().configured, false);
  await f.runtime.selectLocalCli({id:'codex', model:'gpt-5.5'});
  assert.equal(f.runtime.info().configured, true);
});
