import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type CpaConnection = { baseUrl: string; apiKey: string };

/** Use the installed remote-cpa helper's validated config and SSH credential lookup.
 * The secret travels through a captured child-process pipe only, never argv or disk.
 */
export function readCpaConnection(env: NodeJS.ProcessEnv): CpaConnection {
  const helper = join(homedir(), '.codex/skills/remote-cpa/scripts/cpa_request.py');
  const code = 'import json,runpy,sys; m=runpy.run_path(sys.argv[1]); base,key,_=m["client_config"](); print(json.dumps({"baseUrl":base,"apiKey":key}))';
  try {
    const raw = execFileSync('python3', ['-c', code, helper], {
      env: { ...process.env, ...env }, encoding: 'utf8', timeout: 45000,
      maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const value = JSON.parse(raw);
    if (typeof value?.baseUrl !== 'string' || typeof value?.apiKey !== 'string') throw new Error();
    return { baseUrl: value.baseUrl, apiKey: value.apiKey };
  } catch {
    // Child output and errors may contain credentials; do not attach the cause.
    throw new Error('CPA configuration or credential lookup failed. Check the installed remote-cpa helper; no gateway fallback was attempted.');
  }
}
