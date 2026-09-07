import { useEffect, useState } from 'react';
import type { LocalCliInventory } from '../../src/local-cli-types';
import type { RuntimeInfo } from '../../src/collider-types';
import { api } from '../api';

export function LocalCliSettings({ onSelected }: { onSelected: (runtime: RuntimeInfo) => void }) {
  const [inventory, setInventory] = useState<LocalCliInventory | null>(null);
  const [id, setId] = useState('');
  const [model, setModel] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void api<LocalCliInventory>('/local-cli', undefined, controller.signal).then(result => {
      setInventory(result); setId(result.selected || ''); setModel(result.selected ? result.model : '');
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '检测失败，请重试。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const selected = inventory?.entries.find(entry => entry.id === id);
  async function save() {
    setSaving(true); setError('');
    try { onSelected(await api<RuntimeInfo>('/local-cli', { id, model: model.trim() })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '切换失败，原配置保留。'); }
    finally { setSaving(false); }
  }
  return <div className="local-cli-settings">
    <p className="modal-description">检测运行本项目服务的电脑，使用本机 CLI 已有的登录。CLI 通常仍连接其模型服务并使用对应账号额度。</p>
    <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading || saving}>{loading ? '正在检测…' : '重新检测本机 CLI'}</button>
    <fieldset disabled={loading || saving}><legend>选择共创协作 CLI</legend>
      {inventory?.entries.map(entry => <label key={entry.id} className="local-cli-option">
        <input type="radio" name="local-cli" value={entry.id} checked={id === entry.id} disabled={!entry.installed || !entry.supported || entry.login === 'not_logged_in'} onChange={() => { setId(entry.id); setModel(entry.id === inventory.selected ? inventory.model : entry.model || ''); }} />
        <span><strong>{entry.name}</strong><small>{!entry.installed ? '未检测到' : !entry.supported ? '已安装 · 暂未接入' : entry.login === 'logged_in' ? '已安装 · 已登录' : entry.login === 'not_logged_in' ? '已安装 · 请先在终端执行 codex login' : '已安装 · 登录及模型可用性待实际运行验证'}{entry.installed && entry.version ? ` · ${entry.version}` : ''}</small></span>
      </label>)}
    </fieldset>
    <label className="local-cli-model">模型名称<input value={model} maxLength={128} disabled={saving || loading} onChange={event => setModel(event.target.value)} placeholder="填写该 CLI 支持的模型名称" /></label>
    <p className="muted">选择保存在本机，对本服务的共创画布生效。保存时检查 CLI，模型可用性在实际运行时验证。已完成成果保留，后续步骤使用新选择。图像生成仍使用单独配置的图像 API。</p>
    {inventory?.busy && <p role="status">有任务正在运行，请先暂停并等待进程停止，再切换。</p>}
    {error && <p role="alert">{error}</p>}
    <button className="u-primary" type="button" onClick={() => void save()} disabled={saving || loading || inventory?.busy || !selected?.installed || !selected.supported || selected.login === 'not_logged_in' || !/^[a-zA-Z0-9._:/-]{1,128}$/.test(model.trim())}>{saving ? '正在检查并保存…' : '使用此 CLI 和模型'}</button>
  </div>;
}
