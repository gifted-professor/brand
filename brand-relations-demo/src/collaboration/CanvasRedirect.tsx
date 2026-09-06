import { useEffect } from 'react';
export const canvasUrl = (id: string) => `/canvas.html?relation=${encodeURIComponent(id)}`;
export default function CanvasRedirect({ id }: { id: string }) {
  useEffect(() => { window.location.replace(canvasUrl(id)); }, [id]);
  return <p className="br-empty" role="status">正在进入双方渠道预演画板…</p>;
}
