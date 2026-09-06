import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ColliderApp from '../../../brand-collider-skills-design/web/App';
import '../../../brand-collider-skills-design/web/styles.css';
import '../../../brand-collider-skills-design/web/panels.css';
import '../../../brand-collider-skills-design/web/brand-vi.css';
import './canvas-host.css';

function CanvasHost() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    async function connect() {
      const query = new URLSearchParams(location.search), projectId = query.get('relation');
      if (projectId && (!query.get('session') || query.get('project') !== projectId)) {
        const response = await fetch('/api/canvas/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!disposed) history.replaceState(null, '', result.url);
      }
      if (!disposed) setState('ready');
    }
    void connect().catch(reason => { if (!disposed) { setError(reason.message); setState('error'); } });
    return () => { disposed = true; };
  }, []);
  return state === 'ready' ? <ColliderApp channelPreviewMode /> : <main className="canvas-host-loading" role={state === 'error' ? 'alert' : 'status'}><h1>{state === 'error' ? '画板暂未打开' : '正在带入双方品牌与预演…'}</h1>{error && <><p>{error}</p><button onClick={() => location.reload()}>重试</button></>}</main>;
}
createRoot(document.getElementById('root')!).render(<CanvasHost />);
