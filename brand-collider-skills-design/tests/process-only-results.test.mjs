import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ColliderRuntime, isProcessOnlyStageResult } from '../src/server/runtime.ts';

const cwd = resolve(import.meta.dirname, '..');
const english = {
  message: 'I am starting public-source research on Manner Coffee as brand A, then I will deliver the structured profile.',
  section: 'Research is in progress. Public sources will be queried first so facts, replaceable hypotheses, and unknowns can be separated before the brand profile is written.',
  pendingConfirmations: [],
  card: { skill: 'brand-profile', title: 'Manner 品牌资料检索中', summary: 'Research is in progress.', points: [{ label: 'Research', content: 'Public sources will be queried first.' }] },
};
const chinese = {
  message: '正在检索品牌的公开资料，接下来将区分事实、可替换的工作假设与未知条件，然后交付完整品牌档案。',
  section: '品牌研究正在进行中。正在检索品牌的公开资料并查询官方来源，准备逐一核验品牌资产、消费者场景与可以用于联名探索的资源。随后将区分事实、可替换的工作假设与未知条件，整理品牌资料并交付结构化研究报告，供后续创意阶段继续使用。',
  pendingConfirmations: [], card: null,
};
const starting = {
  message: "I'll look up official public sources for Manner Coffee as brand A, then deliver a sourced profile with facts, hypotheses, and open items.",
  section: 'Starting public-source research on Manner Coffee: official positioning, products, channels, visual cues, and any collaboration history, keeping user claims separate from verified facts.',
  pendingConfirmations: [], card: null,
};
const substantive = '当前未获得官方资料，不把任何执行资源写成已授权。工作假设：A 方为咖啡品牌，贡献日常饮用场景与可重复使用的杯具；B 方为游戏品牌，贡献角色世界观与收集体验。建议以每日饮用动作触发一段短故事，杯套承担可替换内容载体，扫码页面承接故事阅读。该机制不依赖已确认的线下门店或赠品库存，素材、许可、预算与履约方式保留在落地确认清单中。';
const valid = stage => ({ message: '已按现有品牌信息与可替换的假设形成下一阶段可用的联名研究结论。', section: substantive,
  pendingConfirmations: ['角色素材、许可和预算待确认。'], card: null,
  ...(stage === 'ideation-b' ? { concepts: [1, 2, 3].map(i => ({ title: `方向${i}`, tagline: `主题${i}`, description: `独立机制${i}`,
    contributionA: '咖啡饮用场景', contributionB: '游戏故事内容', consumerValue: `参与体验${i}` })) } : {}),
});

test('recognizes the complete English and Chinese progress-only result, including the real long placeholder', () => {
  assert.ok(english.section.length >= 100);
  assert.ok(chinese.section.length >= 100);
  assert.equal(isProcessOnlyStageResult(english), true);
  assert.equal(isProcessOnlyStageResult(chinese), true);
  assert.equal(isProcessOnlyStageResult(starting), true);
  assert.equal(isProcessOnlyStageResult({ section: starting.section.replace('Starting', 'Beginning') }), true);
  assert.equal(isProcessOnlyStageResult({ section: starting.message }), true);
  assert.equal(isProcessOnlyStageResult({ section: '# Research is in progress\n- Public sources will be queried first.' }), true);
});

for (const [name, section] of [
  ['explicit assumptions and unknowns', substantive],
  ['a status sentence before useful research', `Research is in progress. ${substantive}`],
  ['a quoted status phrase', '“Research is in progress.” 是旧记录中的状态提示。当前方案以可替换杯套为内容载体，许可与预算待确认。'],
  ['a quoted status phrase alone', '> Research is in progress.'],
  ['a future design decision', '将先设计杯套作为故事入口，再把扫码阅读作为品牌 B 的内容贡献；素材授权与制作数量均待确认。'],
  ['pending language inside a useful conclusion', 'Research findings: use a reusable sleeve for the story entry point. Authorization is pending, so treat this as a replaceable concept assumption.'],
  ['a starting sentence followed by useful conclusions', `${starting.section}\n${substantive}`],
  ['a quoted starting sentence', `“${starting.section}” 是先前的占位说明。`],
  ['a design proposal beginning with Starting', 'Starting with a reusable coffee sleeve gives the customer a daily story entry point; licensing and budget remain open assumptions.'],
]) test(`does not classify ${name} as a process-only result`, () => {
  assert.equal(isProcessOnlyStageResult({ section }), false);
});

async function fixture(t, placeholder, alwaysInvalid = false) {
  const outputDir = await mkdtemp(join(tmpdir(), 'collider-process-only-'));
  const calls = [];
  const provider = { transport: 'grok-cli', model: 'test-process-only', async complete(messages, task) {
    assert.notEqual(task.agentId, 'orchestrator', 'handoffs are programmatic and consume no model calls');
    const stage = /当前步骤：([^；]+)/.exec(messages[0].content)?.[1];
    calls.push({ stage, agentId: task.agentId });
    if (task.agentId === 'research-a' && (alwaysInvalid || calls.filter(call => call.agentId === 'research-a').length === 1)) return placeholder;
    return valid(stage);
  } };
  const runtime = new ColliderRuntime({ cwd, outputDir, provider }); await runtime.init();
  t.after(async () => { await runtime.shutdown(); await rm(outputDir, { recursive: true, force: true }); });
  const created = await runtime.create({ mode: 'live', brands: [{ name: 'Manner' }, { name: '原神' }], goal: '', autoAdvance: false });
  await runtime.run(created.id); await runtime.waitForIdle(created.id);
  return { calls, done: runtime.get(created.id), saved: JSON.parse(await readFile(join(outputDir, `${created.id}.json`), 'utf8')) };
}

for (const [name, placeholder] of [['English', english], ['Chinese', chinese], ['Starting research', starting]]) {
  test(`${name} progress-only output gets exactly one repair before usable research is committed`, async t => {
    const { calls, done, saved } = await fixture(t, placeholder);
    assert.equal(done.status, 'awaiting_selection', done.error);
    assert.equal(calls.filter(call => call.agentId === 'research-a').length, 2);
    assert.equal(calls.filter(call => call.agentId === 'orchestrator').length, 0);
    assert.equal(saved.records.length, 4);
    assert.equal(saved.records.find(record => record.key === 'profile-a').result.section, substantive);
    assert.equal(saved.records.some(record => record.result.section === placeholder.section), false);
    assert.equal(done.messages.some(message => message.artifact?.section === placeholder.section), false);
  });

  test(`${name} repeated progress-only output stops after its bounded repair without advancing the stage`, async t => {
    const { calls, done, saved } = await fixture(t, placeholder, true);
    assert.equal(done.status, 'error');
    assert.match(done.error, /自动修复后/);
    assert.match(done.error, /阶段正文仅包含准备或进行中的说明/);
    assert.doesNotMatch(done.error, /补充资料/);
    assert.deepEqual(calls.slice(0, 2).map(call => call.agentId), ['research-a', 'research-b']);
    assert.equal(calls.filter(call => call.agentId === 'research-a').length, 2);
    assert.equal(calls.filter(call => call.agentId === 'research-b').length, 1);
    assert.deepEqual(saved.records.map(record => record.key), ['profile-b']);
    assert.equal(saved.modelCallsUsed, 3);
    assert.deepEqual(done.completedSkills, []);
    assert.equal(done.messages.some(message => message.agentRole === 'research' && message.role === 'a' && message.artifact), false);
    assert.ok(done.messages.some(message => message.agentRole === 'research' && message.role === 'b' && message.artifact), 'the successful parallel profile remains available');
  });
}
