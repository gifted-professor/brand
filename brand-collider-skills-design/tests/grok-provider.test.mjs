import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GrokCliProvider } from '../src/server/grok-cli-provider.ts';
import { ColliderRuntime } from '../src/server/runtime.ts';
import { stageSchema } from '../src/server/cli-schema.ts';
import { materialPlanFixture, materialVisualFixtures } from './material-fixture.mjs';

const cwd = resolve(import.meta.dirname, '..');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const schema = { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false };
const messages = [{ role: 'system', content: 'Return only the public structured artifact.' },
  { role: 'user', content: 'Brand data: $(touch NEVER) `echo NEVER`\nTwo independent brands.' }];
const deliverySection = '本轮以日常织物作为可重复使用的实体载体，结合自然声音内容形成可触摸、可聆听的联合体验。织物品牌贡献材质与使用场景，声音品牌贡献内容组织与听音入口，双方贡献必须在后续设计和文案中保持一致。库存数量、版权范围、入口服务、制作排期与执行渠道仍待确认，当前只形成明确的概念建议，不将这些资源写成已获得授权或已具备生产条件。';
const handoff = { message: '主控已核对双方资料、当前简报与未确认条件，安排下一项专业任务。', task: '依照指定阶段提交完整结果，区分资料事实与创意建议；承接双方已有研究与所有用户标准，明确本阶段的双方贡献、消费者价值和未确认的执行条件。', blockedReason: null };

async function fixture(t, mode = 'normal', timeoutMs = 3000, envOverrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'collider-grok-'));
  const binary = join(directory, 'fake grok');
  const log = join(directory, 'calls.jsonl');
  await writeFile(binary, `#!${process.execPath}
import {appendFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),mode=${JSON.stringify(mode)},log=${JSON.stringify(log)};
if(args.includes('--version')){appendFileSync(log,JSON.stringify({args})+'\\n');console.log('1.0.13 (5e9a-fake-build)');process.exit(0)}
let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const runtimeEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>key==='GROK_HOME'||key==='GROK_AUTH_PATH'||/^GROK_(CLAUDE|CURSOR)_(AGENTS|RULES|SKILLS|MCPS|HOOKS)_ENABLED$/.test(key)));
appendFileSync(log,JSON.stringify({args,prompt,pid:process.pid,cwd:process.cwd(),leakedKey:process.env.OPENAI_API_KEY||null,runtimeEnv})+'\\n');
process.stderr.write('SECRET_STDERR_DO_NOT_PUBLISH');
const session=args.includes('--resume')?args[args.indexOf('--resume')+1]:args[args.indexOf('--session-id')+1];
if(['effort-metadata','effort-mismatch','effort-invalid'].includes(mode)){
 const folder=join(process.env.GROK_HOME,'sessions',encodeURIComponent(process.cwd()),session);mkdirSync(folder,{recursive:true});
 writeFileSync(join(folder,'summary.json'),JSON.stringify({reasoning_effort:mode==='effort-mismatch'?'high':mode==='effort-invalid'?'SECRET_EFFORT':args[args.indexOf('--reasoning-effort')+1],privateNotes:'PRIVATE_METADATA'}));
}
if(mode==='slow'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000)}else{
 await new Promise(resolve=>setTimeout(resolve,30));
 if(mode==='auth'){process.stdout.write('Login required: SECRET_AUTH_DETAILS');process.exit(1)}
 if(mode==='badjson'){process.stdout.write('{broken SECRET_RAW_STDOUT');process.exit(0)}
 const stage=/当前步骤：([^；]+)/.exec(prompt)?.[1];
 let result=stage?{message:stage+' 已形成具体方案，双方贡献与待确认资源分别列出并交给下一阶段。',section:stage+${JSON.stringify(deliverySection)},pendingConfirmations:['资源待确认'],card:null,blockedReason:null}:{message:'ok',optional:null};
 if(prompt.includes('你是联名总策划'))result=${JSON.stringify(handoff)};
 if(stage==='ideation-b')result.concepts=Array.from({length:3},(_,i)=>({title:'方向'+i,tagline:'短句'+i,description:'机制'+i,contributionA:'A贡献',contributionB:'B贡献',consumerValue:'消费者价值'}));
 if(stage==='design-b')result.materialPlan=${JSON.stringify({ ...materialPlanFixture(), deliveryScope: 'full_collaboration' })};
 if(stage==='visual-b'){result.imagePrompt='真实设计确认前，不生成图像。';result.materialVisuals=${JSON.stringify(materialVisualFixtures())};}
 if(stage==='review-a')result.verdict='unverified';
 let envelope={stopReason:'end_turn',sessionId:session,structuredOutput:result,modelUsage:{'grok-4.6-build':{inputTokens:20,outputTokens:10}},thought:'PRIVATE_THOUGHT_DO_NOT_PUBLISH'};
 if(mode==='raw')envelope=result;
 if(mode==='missingstructured')delete envelope.structuredOutput;
 if(mode==='null')envelope.structuredOutput=null;
 if(mode==='array')envelope.structuredOutput=[result];
 if(mode==='string')envelope.structuredOutput=JSON.stringify(result);
 if(mode==='schemaerror')envelope.structuredOutputError='SECRET_SCHEMA_FAILURE';
 if(mode==='research-placeholder'&&args[args.indexOf('--tools')+1]){
  delete envelope.structuredOutput;envelope.structuredOutputError='SECRET_SCHEMA_FAILURE';
  envelope.text=JSON.stringify({message:'正在检索库迪咖啡官方资料以建立品牌画像。',section:'placeholder',pendingConfirmations:[],card:null,blockedReason:null});
 }
 if(mode==='cancelled'||mode==='cancelledOutput'){envelope.stopReason='cancelled';if(mode==='cancelled')envelope.structuredOutput=null;}
 if(mode==='wrongsession')envelope.sessionId=randomUUID();
 if(mode==='unknownstop')envelope.stopReason='SECRET_UNTRUSTED_STOP_REASON';
 let serialized=JSON.stringify(envelope,null,2);
 if(args[args.indexOf('--output-format')+1]==='streaming-json'){
  const events=[{type:'available_commands',tools:['web_search','web_fetch']},{type:'thought',data:'PRIVATE_THOUGHT_DO_NOT_PUBLISH'}];
  if(!['no-web-research','research-placeholder'].includes(mode))events.push({type:'tool_call',toolCallId:'web-call',toolName:'web_search',rawInput:{query:'PRIVATE_WEB_QUERY'}},
   {type:'tool_call_update',toolCallId:'web-call',status:'completed',rawOutput:{content:'PRIVATE_WEB_OUTPUT'}});
  if(envelope.text)events.push({type:'text',data:envelope.text});
  events.push({type:'end',...envelope});serialized=events.map(event=>JSON.stringify(event)).join('\\n')+'\\n';
 }
 if(mode==='delayed-output'){process.stdout.write(serialized.slice(0,1));await new Promise(resolve=>setTimeout(resolve,100));process.stdout.write(serialized.slice(1));}
 else process.stdout.write(serialized);
 process.exitCode=mode==='exit'?7:0;
}
`, { mode: 0o700 });
  const outputDir = join(directory, 'grok-agents');
  const provider = new GrokCliProvider({ cwd, binary, outputDir, model: 'grok-4.6-build', timeoutMs,
    env: { ...process.env, OPENAI_API_KEY: 'APP_SECRET_MUST_NOT_LEAK', ...envOverrides } });
  const events = [];
  const task = { sessionId: `session-${randomUUID()}`, agentId: 'research-a', revision: 1, schema,
    onExecution: execution => { events.push(execution); } };
  t.after(async () => { await provider.shutdown(); await rm(directory, { recursive: true, force: true }); });
  const commands = async () => (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  const threadPath = (agentId = task.agentId, revision = task.revision) => join(outputDir, task.sessionId, `v${revision}`, agentId, 'thread.json');
  return { directory, outputDir, binary, provider, task, events, commands,
    calls: async () => (await commands()).filter(call => call.pid), threadPath };
}

test('Grok probes its executable without an auth command and returns only structuredOutput', async t => {
  const f = await fixture(t); await f.provider.probe();
  assert.equal(f.provider.transport, 'grok-cli'); assert.ok(f.provider.version);
  assert.equal(f.provider.version, 'grok-cli 1.0.13');
  assert.deepEqual(await f.provider.complete(messages, f.task), { message: 'ok' });
  const commands = await f.commands();
  assert.equal(commands.filter(command => command.args.includes('--version')).length, 1);
  assert.equal(commands.length, 2, 'probe must not issue a login or model request');
  assert.equal(f.events.at(-1).state, 'completed'); assert.ok(f.events.at(-1).finishedAt);
  assert.ok(f.events.every(event => event.transport === 'grok-cli'));
  assert.doesNotMatch(JSON.stringify(f.events), /PRIVATE_THOUGHT|SECRET_STDERR|APP_SECRET/);
  const execution = f.events.at(-1);
  const saved = await readFile(join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId, execution.runId, 'result.json'), 'utf8');
  assert.deepEqual(JSON.parse(saved), { message: 'ok' });
  assert.doesNotMatch(saved, /PRIVATE_THOUGHT|SECRET_STDERR|modelUsage|stopReason/);
});

test('Grok uses stdin and structured arguments, bounds CLI turns, and isolates each successful agent session', async t => {
  const f = await fixture(t);
  await f.provider.complete(messages, f.task); const first = f.events.at(-1);
  await f.provider.complete(messages, f.task); const second = f.events.at(-1);
  await f.provider.complete(messages, { ...f.task, agentId: 'research-b' }); const other = f.events.at(-1);
  await f.provider.complete(messages, { ...f.task, revision: 2 }); const revision = f.events.at(-1);
  assert.notEqual(first.pid, second.pid); assert.notEqual(first.runId, second.runId);
  assert.equal(first.threadId, second.threadId); assert.match(first.threadId, uuid);
  assert.notEqual(other.threadId, first.threadId); assert.notEqual(revision.threadId, first.threadId);
  const calls = await f.calls();
  assert.equal(calls[0].args[calls[0].args.indexOf('--session-id') + 1], first.threadId);
  assert.equal(calls[1].args[calls[1].args.indexOf('--resume') + 1], first.threadId);
  assert.ok(!calls[0].args.includes('--resume'));
  for (const call of calls) {
    assert.equal(call.args[call.args.indexOf('--prompt-file') + 1], '/dev/stdin');
    assert.equal(call.args[call.args.indexOf('--max-turns') + 1], '6');
    assert.equal(call.args[call.args.indexOf('--output-format') + 1], 'streaming-json');
    assert.equal(call.args[call.args.indexOf('--tools') + 1], 'web_search,web_fetch');
    assert.ok(!call.args.includes('--disable-web-search'));
    for (const flag of ['--verbatim', '--no-subagents', '--no-plan', '--no-memory', '--no-auto-update']) assert.ok(call.args.includes(flag));
    assert.equal(call.args[call.args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.equal(call.args[call.args.indexOf('--deny') + 1], 'MCPTool');
    assert.deepEqual(call.args.flatMap((value, index) => value === '--allow' ? [call.args[index + 1]] : []), ['WebSearch', 'WebFetch']);
    assert.equal(call.args[call.args.indexOf('--sandbox') + 1], 'collider');
    assert.deepEqual(JSON.parse(call.args[call.args.indexOf('--json-schema') + 1]), schema);
    assert.ok(!call.args.join(' ').includes('Two independent brands'));
    assert.ok(call.prompt.includes('$(touch NEVER)')); assert.ok(call.prompt.includes('`echo NEVER`'));
    assert.equal(call.leakedKey, null);
  }
  await assert.rejects(readFile(join(calls[0].cwd, 'NEVER')));
  const saved = JSON.parse(await readFile(f.threadPath(), 'utf8')); assert.equal(saved.threadId, first.threadId);
  assert.equal(saved.isolationVersion, 1);
});

test('Grok records bounded local timing and input size without treating stdout as a model token', async t => {
  const f = await fixture(t, 'delayed-output');
  await f.provider.complete([...messages, { role: 'user', content: '品牌🦊'.repeat(100) }], f.task);
  const [call] = await f.calls(), last = f.events.at(-1), metrics = last.metrics;
  assert.equal(metrics.inputChars, call.prompt.length);
  assert.equal(metrics.attempt, 1);
  assert.equal(metrics.requestedReasoningEffort, 'medium');
  assert.equal(metrics.reasoningEffort, undefined, 'requested effort is not reported as observed without CLI metadata');
  assert.equal(metrics.recovery, undefined);
  for (const field of ['preparationMs', 'processStartupMs', 'firstStdoutMs', 'processDurationMs', 'totalDurationMs']) {
    assert.ok(Number.isInteger(metrics[field]) && metrics[field] >= 0, field);
  }
  assert.ok(metrics.processStartupMs <= metrics.firstStdoutMs);
  assert.ok(metrics.processDurationMs - metrics.firstStdoutMs >= 70, 'the recorded first stdout precedes the delayed final JSON');
  assert.ok(metrics.totalDurationMs + 1 >= metrics.preparationMs + metrics.processDurationMs);
  const firstOutput = f.events.find(event => event.metrics.firstStdoutMs !== undefined);
  assert.equal(firstOutput.state, 'running');
  assert.equal(firstOutput.metrics.processDurationMs, undefined, 'published snapshots must not mutate when the process later closes');
  assert.equal(firstOutput.metrics.totalDurationMs, undefined);
  const stored = JSON.parse(await readFile(join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId, last.runId, 'execution.json'), 'utf8'));
  assert.deepEqual(stored.metrics, metrics);
  assert.doesNotMatch(JSON.stringify(metrics), /thought|token|SECRET|PRIVATE/);
});

test('Grok routes each trusted stage and media task to low or medium without changing the model', async t => {
  const f = await fixture(t, 'effort-metadata');
  const cases = [
    ...['profile-a', 'profile-b', 'ideation-a', 'ideation-b', 'design-a', 'design-b', 'review-a'].map(stageKey => [{ stageKey }, 'medium']),
    ...['copy-a', 'visual-b'].map(stageKey => [{ stageKey }, 'low']),
    [{ purpose: 'reference-discovery', agentId: 'media-reference-discovery-test' }, 'low'],
    [{ agentId: 'media-reference-binding-test' }, 'medium'],
    [{ agentId: 'media-pre-render-review-test' }, 'medium'],
    [{ agentId: 'review-a' }, 'medium'],
  ];
  for (const [identity, expected] of cases) {
    await f.provider.complete(messages, { ...f.task, ...identity, contextId: randomUUID() });
    const execution = f.events.at(-1);
    assert.equal(execution.metrics.requestedReasoningEffort, expected);
    assert.equal(execution.metrics.reasoningEffort, expected);
    const saved = JSON.parse(await readFile(join(f.outputDir, f.task.sessionId, 'v1', identity.agentId ?? f.task.agentId, execution.runId, 'execution.json'), 'utf8'));
    assert.equal(saved.metrics.reasoningEffort, expected);
    assert.doesNotMatch(JSON.stringify(saved), /PRIVATE_METADATA/);
  }
  const calls = await f.calls();
  assert.equal(calls.length, cases.length);
  calls.forEach((call, index) => {
    assert.equal(call.args[call.args.indexOf('--reasoning-effort') + 1], cases[index][1]);
    assert.equal(call.args[call.args.indexOf('--model') + 1], 'grok-4.6-build');
  });
});

test('observed effort can disagree with requested effort and arbitrary metadata cannot escape', async t => {
  for (const [mode, observed] of [['effort-mismatch', 'high'], ['effort-invalid', undefined]]) {
    const f = await fixture(t, mode);
    await f.provider.complete(messages, { ...f.task, agentId: 'creative-a', stageKey: 'copy-a' });
    assert.equal(f.events.at(-1).metrics.requestedReasoningEffort, 'low');
    assert.equal(f.events.at(-1).metrics.reasoningEffort, observed);
    assert.doesNotMatch(JSON.stringify(f.events), /SECRET_EFFORT|PRIVATE_METADATA/);
  }
});

test('Grok resumes only the same stage context and a failed new launch cannot fall back to old history', async t => {
  const f = await fixture(t), firstContext = randomUUID(), nextContext = randomUUID();
  await f.provider.complete(messages, f.task);
  const legacy = f.events.at(-1);
  await f.provider.complete(messages, { ...f.task, contextId: firstContext });
  const first = f.events.at(-1);
  await f.provider.complete(messages, { ...f.task, contextId: firstContext, recovery: 'deliver-current-evidence' });
  const repair = f.events.at(-1);
  assert.equal(repair.threadId, first.threadId);
  assert.equal(repair.contextId, firstContext);
  const disabled = `${f.binary}.disabled`;
  await rename(f.binary, disabled);
  try { await assert.rejects(f.provider.complete(messages, { ...f.task, contextId: nextContext }), error => error.status === 503); }
  finally { await rename(disabled, f.binary); }
  assert.equal(f.events.at(-1).contextId, nextContext);
  assert.equal(f.events.at(-1).threadId, undefined);
  await f.provider.complete(messages, { ...f.task, contextId: nextContext, recovery: 'deliver-current-evidence' });
  const next = f.events.at(-1), calls = await f.calls();
  assert.equal(next.contextId, nextContext);
  assert.equal(new Set([legacy.threadId, first.threadId, next.threadId]).size, 3);
  assert.deepEqual(calls.map(call => call.args.includes('--resume')), [false, false, true, false]);
  const directory = join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId);
  for (const [file, expected] of [['thread.json', legacy.threadId], [`thread-${firstContext}.json`, first.threadId], [`thread-${nextContext}.json`, next.threadId]]) {
    assert.equal(JSON.parse(await readFile(join(directory, file), 'utf8')).threadId, expected);
  }
});

test('Grok research repair uses current evidence without new tools, then normal research can resume', async t => {
  const f = await fixture(t);
  await f.provider.complete(messages, f.task);
  const first = f.events.at(-1);
  await f.provider.complete(messages, { ...f.task, recovery: 'deliver-current-evidence' });
  const repairedExecution = f.events.at(-1);
  await f.provider.complete(messages, f.task);
  const [normal, repaired, next] = await f.calls();
  assert.equal(normal.args[normal.args.indexOf('--tools') + 1], 'web_search,web_fetch');
  assert.equal(repaired.args[repaired.args.indexOf('--tools') + 1], '');
  assert.equal(repaired.args[repaired.args.indexOf('--max-turns') + 1], '3');
  assert.equal(repaired.args[repaired.args.indexOf('--resume') + 1], first.threadId);
  assert.ok(repaired.args.includes('--disable-web-search'));
  assert.ok(repaired.args.flatMap((value, index) => value === '--deny' ? [repaired.args[index + 1]] : []).includes('*'));
  assert.equal(repaired.args.includes('--allow'), false);
  assert.match(repaired.prompt, /本阶段唯一一次交付纠正/);
  assert.match(repaired.prompt, /停止计划新检索/);
  assert.match(repaired.prompt, /已取得的证据和明确标注的可替换假设/);
  assert.doesNotMatch(repaired.prompt, /你可用web_search\/web_fetch/);
  assert.doesNotMatch(normal.prompt, /本阶段唯一一次交付纠正/);
  assert.equal(next.args[next.args.indexOf('--tools') + 1], 'web_search,web_fetch');
  assert.equal(next.args[next.args.indexOf('--max-turns') + 1], '6');
  assert.equal(first.metrics.recovery, undefined);
  assert.equal(repairedExecution.metrics.recovery, 'deliver-current-evidence');
  assert.equal(repairedExecution.metrics.inputChars, repaired.prompt.length);
  assert.ok(repairedExecution.metrics.totalDurationMs >= repairedExecution.metrics.processDurationMs);
  assert.equal(f.events.at(-1).metrics.recovery, undefined);
});

for (const [name, envOverrides, expectedAuth] of [
  ['default home', { HOME: '/mock-user-home', GROK_HOME: '', GROK_AUTH_PATH: '' }, '/mock-user-home/.grok/auth.json'],
  ['custom Grok home', { HOME: '/mock-user-home', GROK_HOME: '/mock-user-grok', GROK_AUTH_PATH: '' }, '/mock-user-grok/auth.json'],
  ['explicit authentication path', { HOME: '/mock-user-home', GROK_HOME: '/mock-user-grok', GROK_AUTH_PATH: '/mock-auth/account.json' }, '/mock-auth/account.json'],
]) test(`Grok isolates its runtime with ${name} while referencing the existing authentication path`, async t => {
  const compatibility = Object.fromEntries(['CLAUDE', 'CURSOR'].flatMap(product => ['AGENTS', 'RULES', 'SKILLS', 'MCPS', 'HOOKS'].map(feature => [`GROK_${product}_${feature}_ENABLED`, '1'])));
  const f = await fixture(t, 'normal', 3000, { ...envOverrides, ...compatibility });
  await f.provider.complete(messages, f.task);
  const [call] = await f.calls();
  assert.equal(call.runtimeEnv.GROK_HOME, join(f.outputDir, '.grok-runtime'));
  assert.equal(call.runtimeEnv.GROK_AUTH_PATH, expectedAuth);
  for (const key of Object.keys(compatibility)) assert.equal(call.runtimeEnv[key], '0', key);
  assert.equal(call.leakedKey, null);
  const isolatedHome = join(f.outputDir, '.grok-runtime');
  assert.deepEqual(await readdir(isolatedHome), ['sandbox.toml'], 'the adapter must reference auth, not copy it into its isolated state');
  assert.equal(call.args[call.args.indexOf('--sandbox') + 1], 'collider');
  assert.equal(await readFile(join(isolatedHome, 'sandbox.toml'), 'utf8'),
    `[profiles.collider]\nextends = "strict"\nread_write = [${JSON.stringify(dirname(expectedAuth))}]\n`,
    'the strict profile may grant only the source auth directory needed for login locks and atomic refresh');
});

for (const isolationVersion of [undefined, 0, 2]) test(`a saved thread with isolationVersion=${isolationVersion} cannot resume legacy context`, async t => {
  const f = await fixture(t);
  const legacyThread = randomUUID();
  await mkdir(join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId), { recursive: true });
  await writeFile(f.threadPath(), JSON.stringify({ threadId: legacyThread, ...(isolationVersion === undefined ? {} : { isolationVersion }) }));
  await f.provider.complete(messages, f.task);
  const [call] = await f.calls();
  assert.equal(call.args.includes('--resume'), false);
  assert.ok(call.args.includes('--session-id'));
  assert.notEqual(f.events.at(-1).threadId, legacyThread);
  const saved = JSON.parse(await readFile(f.threadPath(), 'utf8'));
  assert.equal(saved.isolationVersion, 1);
  assert.equal(saved.threadId, f.events.at(-1).threadId);
});

for (const [mode, expected] of [
  ['normal', { stopReason: 'end_turn', schemaError: false, sessionMatches: true, structuredObject: true }],
  ['schemaerror', { stopReason: 'end_turn', schemaError: true, sessionMatches: true, structuredObject: true,
    schemaFailure: { kind: 'unclassified_schema_failure', fieldLengths: { message: 2 }, issues: [] } }],
  ['wrongsession', { stopReason: 'end_turn', schemaError: false, sessionMatches: false, structuredObject: true }],
  ['missingstructured', { stopReason: 'end_turn', schemaError: false, sessionMatches: true, structuredObject: false }],
  ['unknownstop', { stopReason: 'unknown', schemaError: false, sessionMatches: true, structuredObject: true }],
]) test(`Grok ${mode} diagnostic persists only allowlisted fields without the raw envelope`, async t => {
  const f = await fixture(t, mode);
  if (mode === 'normal') await f.provider.complete(messages, f.task);
  else await assert.rejects(f.provider.complete(messages, f.task), error => error.status === 502);
  const runDirectory = join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId, f.events.at(-1).runId);
  const diagnostic = JSON.parse(await readFile(join(runDirectory, 'diagnostics.json'), 'utf8'));
  assert.deepEqual(diagnostic, expected);
  for (const name of await readdir(runDirectory)) {
    assert.doesNotMatch(await readFile(join(runDirectory, name), 'utf8'), /PRIVATE_THOUGHT|SECRET_STDERR|SECRET_SCHEMA|SECRET_UNTRUSTED|modelUsage|inputTokens|outputTokens/);
  }
});

test('Grok research records real web events and requires search before preliminary final JSON in its instructions', async t => {
  const f = await fixture(t);
  await f.provider.complete(messages, f.task);
  const [call] = await f.calls();
  assert.equal(call.args[call.args.indexOf('--output-format') + 1], 'streaming-json');
  assert.match(call.args[call.args.indexOf('--system-prompt-override') + 1], /first action must be an actual web_search/);
  assert.match(call.prompt, /仅有品牌名或上一轮未核验线索不能替代本轮查证/);
  const runDirectory = join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId, f.events.at(-1).runId);
  const evidence = JSON.parse(await readFile(join(runDirectory, 'research-evidence.json'), 'utf8'));
  assert.equal(evidence.attempts.length, 1);
  assert.equal(evidence.attempts[0].outcome, 'executed');
  assert.deepEqual(evidence.attempts[0].calls, [{ callId: 'web-call', name: 'web_search', status: 'completed' }]);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_WEB|PRIVATE_THOUGHT/);
  await assert.rejects(readFile(join(runDirectory, 'discovery-evidence.json')));
});

test('valid research from supplied materials is retained with honest no-web evidence and no extra calls', async t => {
  const f = await fixture(t, 'no-web-research');
  const result = await f.provider.complete([{ role: 'system', content: '当前步骤：profile-a；依据已提供正式资料交付完整研究，注明未重新检索。' },
    ...messages], { ...f.task, schema: stageSchema('brand-profile') });
  assert.ok(result.message.length >= 20 && result.section.length >= 100);
  assert.equal((await f.calls()).length, 1);
  const evidence = JSON.parse(await readFile(join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId,
    f.events.at(-1).runId, 'research-evidence.json'), 'utf8'));
  assert.equal(evidence.attempts[0].outcome, 'no_web_activity');
  assert.deepEqual(evidence.attempts[0].calls, []);
});

test('research placeholder diagnostics reveal field lengths without adding discovery retries or accepting raw public text', async t => {
  const f = await fixture(t, 'research-placeholder');
  const task = { ...f.task, schema: stageSchema('brand-profile') };
  await assert.rejects(f.provider.complete(messages, task), error => error.status === 502);
  assert.equal((await f.calls()).length, 1, 'research does not enter the two-attempt discovery loop');
  const runDirectory = join(f.outputDir, f.task.sessionId, 'v1', f.task.agentId, f.events.at(-1).runId);
  const diagnostic = JSON.parse(await readFile(join(runDirectory, 'diagnostics.json'), 'utf8'));
  assert.equal(diagnostic.structuredObject, false);
  assert.deepEqual(diagnostic.schemaFailure, { kind: 'public_field_constraints', fieldLengths: { message: 20, section: 11 }, issues: ['section_below_min_length'] });
  assert.doesNotMatch(JSON.stringify(diagnostic), /placeholder|正在检索|SECRET|PRIVATE/);
  await assert.rejects(readFile(join(runDirectory, 'result.json')));
  await assert.rejects(readFile(f.threadPath()));
  await f.provider.complete(messages, { ...task, recovery: 'deliver-current-evidence' });
  const calls = await f.calls();
  assert.equal(calls.length, 2, 'only the caller-requested repair runs');
  assert.equal(calls[1].args[calls[1].args.indexOf('--output-format') + 1], 'json');
  assert.equal(calls[1].args[calls[1].args.indexOf('--tools') + 1], '');
  assert.match(calls[1].prompt, /未实际取得的来源不能写成已检索事实/);
});

test('Grok main, creative and review activations cannot use research or local execution tools', async t => {
  const f = await fixture(t);
  for (const agentId of ['orchestrator', 'creative-a', 'review-a']) await f.provider.complete(messages, { ...f.task, agentId });
  for (const call of await f.calls()) {
    assert.equal(call.args[call.args.indexOf('--max-turns') + 1], '3');
    assert.equal(call.args[call.args.indexOf('--tools') + 1], '');
    assert.ok(call.args.includes('--verbatim'));
    assert.ok(call.args.includes('--disable-web-search'));
    assert.deepEqual(call.args.flatMap((value, index) => value === '--allow' ? [call.args[index + 1]] : []), []);
    const deny = call.args.flatMap((value, index) => value === '--deny' ? [call.args[index + 1]] : []);
    assert.ok(deny.includes('*'));
    assert.ok(deny.includes('MCPTool'));
  }
});

test('Grok locks one agent before asynchronous setup but allows different identities independently', async t => {
  const f = await fixture(t);
  const first = f.provider.complete(messages, f.task);
  await assert.rejects(f.provider.complete(messages, f.task), error => error.status === 409);
  await Promise.all([first, f.provider.complete(messages, { ...f.task, agentId: 'review-a' })]);
  const calls = await f.calls(); assert.equal(calls.length, 2); assert.notEqual(calls[0].pid, calls[1].pid);
});

for (const mode of ['badjson', 'raw', 'missingstructured', 'null', 'array', 'string', 'schemaerror', 'cancelled', 'cancelledOutput', 'wrongsession', 'exit']) {
  test(`Grok ${mode} cannot commit or persist a successful resumable session`, async t => {
    const f = await fixture(t, mode);
    await assert.rejects(f.provider.complete(messages, f.task), error => error.status === 502 && !/SECRET|PRIVATE_THOUGHT/.test(error.message));
    assert.equal(f.events.at(-1).state, 'failed');
    await assert.rejects(readFile(f.threadPath()));
    assert.doesNotMatch(JSON.stringify(f.events), /SECRET|PRIVATE_THOUGHT/);
  });
}

test('Grok login or exit failure never publishes raw CLI diagnostics', async t => {
  const f = await fixture(t, 'auth');
  await assert.rejects(f.provider.complete(messages, f.task), error => [502, 503].includes(error.status) && !error.message.includes('SECRET'));
  assert.equal(f.events.at(-1).state, 'failed');
  assert.doesNotMatch(JSON.stringify(f.events), /SECRET_AUTH|SECRET_STDERR/);
  await assert.rejects(readFile(f.threadPath()));
});

test('Grok cancellation kills its process and does not commit incomplete work', async t => {
  const f = await fixture(t, 'slow'); const controller = new AbortController();
  const call = f.provider.complete(messages, { ...f.task, signal: controller.signal });
  while (!f.events.some(event => event.pid)) await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort(); await assert.rejects(call, error => error.status === 499);
  const last = f.events.at(-1); assert.equal(last.state, 'interrupted'); assert.throws(() => process.kill(last.pid, 0));
  await assert.rejects(readFile(f.threadPath()));
});

test('Grok timeout stops a hung activation and exposes a retryable timeout without stderr', async t => {
  const f = await fixture(t, 'slow', 1000);
  await assert.rejects(f.provider.complete(messages, f.task), error => error.status === 504 && !error.message.includes('SECRET'));
  const last = f.events.at(-1); assert.equal(last.state, 'failed'); assert.throws(() => process.kill(last.pid, 0));
  assert.equal(last.metrics.firstStdoutMs, undefined, 'a silent process has no observed stdout latency');
  assert.ok(last.metrics.processDurationMs >= 900);
  assert.ok(last.metrics.totalDurationMs >= last.metrics.processDurationMs);
});

test('Grok shutdown terminates all active processes and refuses new work', async t => {
  const f = await fixture(t, 'slow');
  const outcomes = Promise.allSettled([f.provider.complete(messages, f.task), f.provider.complete(messages, { ...f.task, agentId: 'review-a' })]);
  while (f.events.filter(event => event.pid).length < 2) await new Promise(resolve => setTimeout(resolve, 5));
  await f.provider.shutdown();
  assert.ok((await outcomes).every(outcome => outcome.status === 'rejected' && outcome.reason.status === 499));
  await assert.rejects(f.provider.complete(messages, f.task), error => error.status === 499);
});

test('Grok rejects invalid task identities and already-cancelled activations before spawning', async t => {
  const f = await fixture(t);
  await assert.rejects(f.provider.complete(messages, { ...f.task, agentId: '../research' }), error => error.status === 500);
  for (const contextId of ['../stage', '', null, [randomUUID()]]) {
    await assert.rejects(f.provider.complete(messages, { ...f.task, contextId }), error => error.status === 500);
  }
  for (const stageKey of ['../copy-a', '', null, ['copy-a']]) {
    await assert.rejects(f.provider.complete(messages, { ...f.task, stageKey }), error => error.status === 500);
  }
  await assert.rejects(f.provider.complete(messages, { ...f.task, signal: AbortSignal.abort() }), error => error.status === 499);
  await assert.rejects(readFile(join(f.directory, 'calls.jsonl')));
});

test('Grok missing executable fails explicitly without attempting a different transport', async t => {
  const f = await fixture(t);
  const missing = new GrokCliProvider({ cwd, binary: join(f.directory, 'missing'), outputDir: f.outputDir });
  t.after(() => missing.shutdown());
  await assert.rejects(missing.probe(), error => error.status === 503);
});

test('the full workflow dispatches nine professional Grok activations with fresh stage contexts and no master calls', async t => {
  const f = await fixture(t);
  const runtime = new ColliderRuntime({ cwd, provider: f.provider, outputDir: join(f.directory, 'sessions') });
  t.after(() => runtime.shutdown()); await runtime.init();
  const session = await runtime.create({ mode: 'live', autoAdvance: false, brands: [
    { id: 'a', name: '织物品牌', description: '用户提供：使用库存织物。', files: [] },
    { id: 'b', name: '声音品牌', description: '用户提供：自然声音内容。', files: [] },
  ], goal: '围绕库存织物共同探索自然声音体验', constraints: ['不新增印刷'] });
  await runtime.run(session.id); await runtime.waitForIdle(session.id);
  assert.equal(runtime.get(session.id).status, 'awaiting_selection', runtime.get(session.id).error);
  await runtime.select(session.id, { conceptId: 'concept-1' }); await runtime.waitForIdle(session.id);
  const done = runtime.get(session.id); assert.equal(done.status, 'completed', done.error);
  const workers = done.messages.filter(message => message.kind === 'skill');
  const masters = done.messages.filter(message => message.kind === 'notice' && message.execution);
  const calls = await f.calls();
  assert.equal(workers.length, 9); assert.equal(masters.length, 0); assert.equal(calls.length, 9);
  for (const call of calls) {
    const stage = /当前步骤：([^；]+)/.exec(call.prompt)?.[1];
    assert.equal(call.args[call.args.indexOf('--reasoning-effort') + 1], ['copy-a', 'visual-b'].includes(stage) ? 'low' : 'medium', stage);
  }
  for (const message of workers) {
    assert.equal(message.status, 'done'); assert.equal(message.execution.transport, 'grok-cli');
    assert.equal(message.execution.state, 'completed'); assert.ok(message.execution.pid);
    assert.match(message.execution.contextId, uuid);
  }
  assert.equal(new Set(workers.map(message => message.execution.agentId)).size, 5);
  assert.equal(new Set(workers.map(message => message.execution.threadId)).size, 9);
  assert.equal(new Set(workers.map(message => message.execution.contextId)).size, 9);
  assert.ok(calls.every(call => !call.args.includes('--resume')), 'later stages cannot retain earlier prompts through CLI history');
  assert.ok(done.messages.filter(message => message.artifact).every(message => message.execution?.transport === 'grok-cli'));
  assert.doesNotMatch(JSON.stringify(done), /PRIVATE_THOUGHT|SECRET_STDERR|APP_SECRET/);
  assert.equal(runtime.info().transport, 'grok-cli');
});
