import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
type Reason = 'timeout' | 'cancelled' | 'spawn_error' | 'stdin_error' | 'invalid_stream' | 'output_limit' | 'exit';
/** Metadata only: never persist raw output, prompts, credentials or private thought. */
export function createCliActivity(directory: string, identity: { runId: string; agentId: string }, heartbeatMs = 5000) {
  const start = Date.now();
  const state = { version: 1, ...identity, startedAt: new Date(start).toISOString(), phase: 'starting',
    pid: undefined as number | undefined, stdoutBytes: 0, stderrBytes: 0, eventCount: 0,
    lastStdoutAt: undefined as string | undefined, lastStderrAt: undefined as string | undefined,
    lastEventAt: undefined as string | undefined, lastEvent: undefined as string | undefined,
    availableTools: [] as string[], webCallsStarted: 0, webCallsFinished: 0,
    stderrSignals: [] as string[], reason: undefined as Reason | undefined,
    exitCode: undefined as number | null | undefined, signal: undefined as string | null | undefined,
    timeline: [] as { at: string; event: string; phase: string }[], logWriteFailed: false };
  let writes = Promise.resolve(), lastWrite = 0, closed = false;
  const persist = (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 1000) return;
    lastWrite = now;
    const json = JSON.stringify({ ...state, updatedAt: new Date(now).toISOString(), elapsedMs: now - start,
      stdoutIdleMs: now - (state.lastStdoutAt ? Date.parse(state.lastStdoutAt) : start) }, null, 2);
    writes = writes.then(async () => {
      await writeFile(join(directory, 'activity.tmp'), json, { mode: 0o600 });
      await rename(join(directory, 'activity.tmp'), join(directory, 'activity.json'));
    }).catch(() => { state.logWriteFailed = true; });
  };
  const mark = (event: string, phase: string) => {
    state.phase = phase; state.timeline.push({ at: new Date().toISOString(), event, phase });
    if (state.timeline.length > 64) state.timeline.shift(); persist();
  };
  const timer = setInterval(() => persist(true), heartbeatMs); timer.unref(); persist(true);
  const calls = new Set<string>(), finished = new Set<string>();
  return {
    spawned(pid?: number) { state.pid = pid; mark('spawned', 'waiting_cli_output'); },
    stdout(bytes: number) { state.stdoutBytes += bytes; state.lastStdoutAt = new Date().toISOString();
      if (state.phase === 'waiting_cli_output') state.phase = 'receiving_cli_output'; },
    stderr(chunk: Buffer | string) {
      state.stderrBytes += Buffer.byteLength(chunk); state.lastStderrAt = new Date().toISOString();
      const text = chunk.toString().slice(0, 8192);
      for (const [name, pattern] of [['authentication', /unauthorized|authentication|login required|\b401\b/i],
        ['rate_limit', /rate.limit|\b429\b/i], ['network', /ECONNRESET|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/],
        ['tls', /CERT_HAS_EXPIRED|certificate verify|TLS handshake/i]] as const) {
        if (pattern.test(text) && !state.stderrSignals.includes(name)) state.stderrSignals.push(name);
      }
    },
    event(event: Record<string, unknown>) {
      state.eventCount++;
      const type = ['available_commands', 'tool_call', 'tool_call_update', 'text', 'end'].includes(String(event.type)) ? String(event.type) : 'other';
      state.lastEvent = type; state.lastEventAt = new Date().toISOString();
      if (type === 'available_commands') {
        const tools = event.tools;
        state.availableTools = Array.isArray(tools) ? ['web_search', 'web_fetch'].filter(tool => tools.includes(tool)) : [];
        mark(type, 'waiting_model_or_cli');
      } else if (type === 'tool_call' && typeof event.toolCallId === 'string' && event.toolCallId.length < 300
        && (['web_search', 'web_fetch'].includes(String(event.toolName)) || /^web search(?::|\b)/i.test(String(event.toolName)))) {
        calls.add(event.toolCallId); state.webCallsStarted = calls.size; mark(type, 'waiting_tool');
      } else if (type === 'tool_call_update' && typeof event.toolCallId === 'string' && calls.has(event.toolCallId)
        && ['completed', 'failed', 'cancelled'].includes(String(event.status))) {
        finished.add(event.toolCallId); state.webCallsFinished = finished.size; mark(type, calls.size > finished.size ? 'waiting_tool' : 'waiting_model_or_cli');
      } else if (type === 'text') mark(type, 'receiving_cli_output');
      else if (type === 'end') mark(type, 'waiting_process_exit');
    },
    stop(reason: Reason) { state.reason ??= reason; mark(reason, state.phase); persist(true); },
    async close(code: number | null, signal: string | null) {
      if (closed) return; closed = true; clearInterval(timer); state.exitCode = code; state.signal = signal; state.reason ??= 'exit';
      mark('closed', 'closed'); persist(true); await writes;
    },
  };
}
