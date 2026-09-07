import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LocalCliEntry, SelectableCli } from '../local-cli-types.ts';
import { CodexCliProvider, cliEnvironment } from './codex-cli-provider.ts';
import { GrokCliProvider } from './grok-cli-provider.ts';
import { RuntimeError } from './text-provider.ts';
const execute = promisify(execFile);
export type LocalCliOptions = { env?: NodeJS.ProcessEnv; outputDir?: string };
const definitions = [
  { id: 'codex', name: 'Codex', key: 'CODEX_CLI_BIN', version: /codex-cli [\w.+-]+/ },
  { id: 'grok', name: 'Grok', key: 'GROK_CLI_BIN', version: /(?:grok(?:-cli)?\s+)?\d+\.\d+\.\d+[\w.+-]*/i },
  { id: 'claude', name: 'Claude Code', key: 'CLAUDE_CLI_BIN', version: /\d+\.\d+\.\d+[\w.+-]*(?: \(Claude Code\))?/ },
  { id: 'gemini', name: 'Gemini CLI', key: 'GEMINI_CLI_BIN', version: /\d+\.\d+\.\d+[\w.+-]*/ },
] as const;
export async function detectLocalClis(options: LocalCliOptions = {}): Promise<LocalCliEntry[]> {
  const source = options.env ?? process.env, env = cliEnvironment(source);
  return Promise.all(definitions.map(async definition => {
    const id = definition.id;
    const entry: LocalCliEntry = { id, name: definition.name, installed: false, supported: id === 'codex' || id === 'grok', login: 'unknown',
      ...(id === 'codex' ? { model: source.CODEX_CLI_MODEL || 'gpt-5.5' } : id === 'grok' ? { model: source.GROK_CLI_MODEL || 'grok-4.6' } : {}) };
    const binary = source[definition.key] || id;
    try {
      const { stdout } = await execute(binary, ['--version'], { env, timeout: 5000, maxBuffer: 16384 });
      entry.version = definition.version.exec(stdout)?.[0];
      entry.installed = Boolean(entry.version);
      if (entry.installed && id === 'codex') {
        try { await execute(binary, ['login', 'status'], { env, timeout: 5000, maxBuffer: 16384 }); entry.login = 'logged_in'; }
        catch (error) { if (typeof (error as {code?: unknown}).code === 'number') entry.login = 'not_logged_in'; }
      }
    } catch { /* Inventory never exposes raw CLI output, auth files or environment. */ }
    return entry;
  }));
}
export function localCliSelection(input: unknown): { id: SelectableCli; model: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RuntimeError('请选择本地 CLI 和模型。');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['id', 'model'].includes(key)) || !['codex', 'grok'].includes(String(value.id))
    || typeof value.model !== 'string' || !/^[a-zA-Z0-9._:/-]{1,128}$/.test(value.model)) throw new RuntimeError('CLI 或模型名称无效。');
  return { id: value.id as SelectableCli, model: value.model };
}
export async function openLocalCli(input: unknown, cwd: string, options: LocalCliOptions = {}) {
  const selection = localCliSelection(input), env = options.env ?? process.env;
  const shared = { cwd, env, outputDir: join(options.outputDir ?? join(cwd, 'outputs/cli-agents'), selection.id), model: selection.model };
  const provider = selection.id === 'codex'
    ? new CodexCliProvider({ ...shared, binary: env.CODEX_CLI_BIN, timeoutMs: Number(env.CODEX_CLI_TIMEOUT_MS || 600000) })
    : new GrokCliProvider({ ...shared, binary: env.GROK_CLI_BIN, timeoutMs: Number(env.GROK_CLI_TIMEOUT_MS || 600000) });
  try { await provider.probe(); return provider; }
  catch (error) { await provider.shutdown(); throw error; }
}
