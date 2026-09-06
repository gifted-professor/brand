import type { Project } from './model';
export async function projectApi<T>(path = '', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/projects${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '项目操作未完成，请重试。');
  return data;
}
export const createProject = (brands: { a: Project['brands']['a']; b: Project['brands']['b'] }, draft?: Project['invitation']['draft']) => projectApi<Project>('', { brands, draft });
