class ServiceUnavailableError extends Error {
  constructor(readOnly: boolean) {
    super(readOnly
      ? '本地服务暂时不可用，暂时无法读取协作进度。请稍后重试。'
      : '本地服务暂时不可用，未能确认本次操作结果。请恢复连接后先核对协作进度。');
    this.name = 'ServiceUnavailableError';
  }
}

export function isServiceUnavailable(error: unknown): boolean {
  return error instanceof ServiceUnavailableError;
}

function checkAbort(error: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if (error instanceof Error && error.name === 'AbortError') throw error;
}

function retryDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal!.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function request<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const readOnly = body === undefined;
  signal?.throwIfAborted();
  // Serialize before the network try/catch: malformed caller data is not a service outage.
  const payload = readOnly ? undefined : JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: readOnly ? 'GET' : 'POST',
      headers: readOnly ? undefined : { 'Content-Type': 'application/json' },
      body: payload, signal,
    });
  } catch (error) {
    checkAbort(error, signal);
    throw new ServiceUnavailableError(readOnly);
  }
  let data: unknown;
  let invalidJson = false;
  try { data = await response.json(); }
  catch (error) {
    checkAbort(error, signal);
    // A response body can lose its connection after fetch has resolved.
    if (error instanceof TypeError) throw new ServiceUnavailableError(readOnly);
    invalidJson = true;
  }
  signal?.throwIfAborted();
  const detail = data && typeof data === 'object' ? data as Record<string, unknown> : undefined;
  if (!response.ok) {
    const unavailable = detail?.code === 'service_starting' || detail?.code === 'service_stopping'
      || ([502, 503, 504].includes(response.status) && !(detail && ('message' in detail || 'error' in detail)));
    if (unavailable) throw new ServiceUnavailableError(readOnly);
    const message = typeof detail?.message === 'string' && detail.message
      || typeof detail?.error === 'string' && detail.error;
    throw new Error(message || `本次操作失败（${response.status}），请检查任务状态后重试。`);
  }
  if (invalidJson) throw new Error('本地服务返回的内容格式无效，无法读取协作进度。请稍后重试。');
  return data as T;
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await request<T>(path, body, signal); }
    catch (error) {
      if (body !== undefined || !isServiceUnavailable(error) || attempt >= 2) throw error;
      await retryDelay(250 * (attempt + 1), signal);
    }
  }
}

export async function uploadFile(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error('单份资料请控制在 8 MB 以内。');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
  return api<{ name: string; text: string }>('/uploads', { name: file.name, data });
}
