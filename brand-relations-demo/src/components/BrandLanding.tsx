import { useEffect, useState } from 'react';
import type { Brand } from '../domain/types';
import { BrandCharacter } from './BrandCharacter';
import { FlowIcon } from './FlowIcon';

export function BrandLanding({ brands, onStart, onExample }: { brands: readonly Brand[]; onStart: () => void; onExample: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    if (paused || motion.matches || brands.length < 2) return;
    const interval = window.setInterval(() => { if (!document.hidden && !motion.matches) setIndex(value => (value + 1) % brands.length); }, 2600);
    return () => window.clearInterval(interval);
  }, [brands.length, paused]);
  return <main className="character-entry">
    <section className="entry-copy"><h1>让你的品牌，<br />遇见新的可能。</h1><p className="entry-subtitle">上传你的品牌信息，生成专属的角色。</p>
      <div className="landing-actions"><button className="avatar-upload" onClick={onStart}><FlowIcon name="upload" /><strong>上传你的品牌信息</strong><span>介绍品牌 · 生成角色 · 发现伙伴</span></button><button className="flow-secondary" onClick={onExample}>使用示例品牌</button></div>
    </section>
    <section className="entry-stage uncertain-stage" aria-label="轮换品牌角色"><div className="entry-stage-ring" /><div key={index} className="entry-avatar uncertain-avatar" aria-hidden="true"><BrandCharacter brand={brands[index % brands.length]} /></div><div className="entry-avatar-caption"><strong>下一次相遇，尚未定义。</strong><button className="entry-text-button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? '继续轮换' : '暂停轮换'}</button></div></section>
    <footer className="entry-footer"><span>01 / 品牌入场</span><span>品牌 → 相遇 → 联名</span><span>示例品牌与数据均为虚构</span></footer>
  </main>;
}
