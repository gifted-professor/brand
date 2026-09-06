import { execFile, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

export type CpaConnection = { baseUrl: string; apiKey: string };

const execute = promisify(execFile);
const helper = join(homedir(), '.codex/skills/remote-cpa/scripts/cpa_request.py');
const code = 'import json,runpy,sys; m=runpy.run_path(sys.argv[1]); base,key,_=m["client_config"](); print(json.dumps({"baseUrl":base,"apiKey":key}))';
const lookupError = () => new Error('CPA configuration or credential lookup failed. Check the installed remote-cpa helper; no gateway fallback was attempted.');
const lookupOptions = (env: NodeJS.ProcessEnv) => ({
  env: { ...process.env, ...env }, encoding: 'utf8' as const, timeout: 45000, maxBuffer: 64 * 1024,
});
function parseConnection(raw: string): CpaConnection {
  const value = JSON.parse(raw);
  if (typeof value?.baseUrl !== 'string' || typeof value?.apiKey !== 'string') throw new Error();
  return { baseUrl: value.baseUrl, apiKey: value.apiKey };
}

/** Use the installed remote-cpa helper's validated config and SSH credential lookup.
 * The secret travels through a captured child-process pipe only, never argv or disk.
 */
export function readCpaConnection(env: NodeJS.ProcessEnv): CpaConnection {
  try {
    const raw = execFileSync('python3', ['-c', code, helper], {
      ...lookupOptions(env), stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseConnection(raw);
  } catch {
    // Child output and errors may contain credentials; do not attach the cause.
    throw lookupError();
  }
}

/** The server can keep answering lifecycle requests while the credential helper runs. */
export async function readCpaConnectionAsync(env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<CpaConnection> {
  signal?.throwIfAborted();
  try {
    const { stdout } = await execute('python3', ['-c', code, helper], { ...lookupOptions(env), signal });
    signal?.throwIfAborted();
    return parseConnection(stdout);
  } catch {
    signal?.throwIfAborted();
    // Do not include stderr, stdout or the original error/cause in any failure.
    throw lookupError();
  }
}
