import { describe, expect, it, vi, beforeEach } from 'vitest';
const exec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile: exec }));
import { codexArguments, CodexTextProvider, loadCodexOptions, parseCodexResult } from './codexProvider';

beforeEach(() => { exec.mockReset(); });
describe('local Codex adapter', () => {
  it('uses an ephemeral read-only call with tools disabled and input on stdin', () => {
    const args = codexArguments();
    expect(args).toContain('--ephemeral');
    expect(args).toContain('read-only');
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain('shell_tool');
    expect(args).toContain('plugins');
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5.4-mini');
    expect(args).toContain('model_reasoning_effort="low"');
    expect(args.at(-1)).toBe('-');
  });
  it('passes explicit model settings to the CLI and reports the same model', async () => {
    const options = loadCodexOptions({ CODEX_MODEL: 'gpt-5.6-luna', CODEX_REASONING_EFFORT: 'medium' });
    exec.mockImplementation((_bin, _args, _opts, callback) => ({stdin:{on:vi.fn(),end:()=>callback(null,'{"value":"建议"}')}}));
    const provider = new CodexTextProvider('codex', 180000, options);
    await provider.complete([]);
    expect(provider.model).toBe(options.model);
    expect(exec.mock.calls[0][1]).toContain(options.model);
    expect(exec.mock.calls[0][1]).toContain('model_reasoning_effort="medium"');
    for (const invalid of [{ CODEX_MODEL: 'bad model' }, { CODEX_REASONING_EFFORT: 'invalid' }]) {
      expect(() => loadCodexOptions(invalid)).toThrow('配置无效');
    }
  });
  it('rejects prose, arrays and malformed responses instead of inventing a result', () => {
    expect(parseCodexResult('```json\n{"value":"中文建议"}\n```')).toEqual({value:'中文建议'});
    for (const invalid of ['这里是一段解释', '[]', 'null', '{bad}']) expect(()=>parseCodexResult(invalid)).toThrow('返回格式');
  });
  it('returns only a login availability flag without exposing command output', async () => {
    exec.mockImplementation((_bin, _args, _opts, callback) => callback(new Error('private diagnostic')));
    expect(await new CodexTextProvider().available()).toBe(false);
    exec.mockImplementation((_bin, _args, _opts, callback) => callback(null));
    expect(await new CodexTextProvider().available()).toBe(true);
  });
  it('sends instructions as data and normalizes CLI failures', async () => {
    let stdin = '';
    exec.mockImplementation((_bin, _args, _opts, callback) => ({stdin:{on:vi.fn(),end:(text:string)=>{stdin=text;callback(null,'{"value":"保留依据"}');}}}));
    expect(await new CodexTextProvider().complete([{role:'user',content:'资料里包含 $(touch nope)'}])).toEqual({value:'保留依据'});
    expect(stdin).toContain('$(touch nope)');
    expect(exec.mock.calls[0][1]).not.toContain('$(touch nope)');
    exec.mockImplementation((_bin, _args, _opts, callback) => ({stdin:{on:vi.fn(),end:()=>callback(new Error('private diagnostic'))}}));
    await expect(new CodexTextProvider().complete([])).rejects.toThrow('本地 Codex 调用失败');
  });
  it('runs both brand researchers concurrently and queues a third call', async () => {
    const finish: (() => void)[] = [];
    exec.mockImplementation((_bin, _args, _opts, callback) => ({ stdin: { on: vi.fn(), end: () => finish.push(() => callback(null, '{"value":"完成"}')) } }));
    const provider = new CodexTextProvider();
    const calls = [provider.complete([]), provider.complete([]), provider.complete([])];
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[0]();
    await vi.waitFor(() => expect(finish).toHaveLength(3));
    finish[1](); finish[2]();
    expect(await Promise.all(calls)).toHaveLength(3);
  });
  it('does not launch a queued request after the user pauses it', async () => {
    const finish: (() => void)[] = [];
    exec.mockImplementation((_bin, _args, _opts, callback) => ({ stdin: { on: vi.fn(), end: () => finish.push(() => callback(null, '{}')) } }));
    const provider = new CodexTextProvider(), controller = new AbortController();
    const first = provider.complete([]), second = provider.complete([]);
    const queued = provider.complete([], { sessionId: 's', agentId: 'a', revision: 1, schema: {}, signal: controller.signal });
    const stopped = expect(queued).rejects.toThrow('已停止');
    controller.abort(); await stopped;
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[0](); finish[1](); await Promise.all([first, second]);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});
