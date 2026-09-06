import type { Brand } from '../domain/types';
import { WearableCharacter } from './WearableCharacter';
import { drawWearable } from '../domain/drawWardrobe';
import { Icon } from './Icon';
import { JourneyFooter } from './JourneyFooter';

export function BrandProfilePage({ brand, onEdit, onExplore }: { brand: Brand; onEdit: () => void; onExplore: () => void }) {
  return <main className="character-entry">
    <section className="entry-copy">
      <p className="entry-brand-label">我的个人 IP</p>
      <h1>{brand.name}</h1>
      <p className="entry-subtitle">{brand.summary}</p>
      <dl className="entry-brand-profile"><div><dt>品牌类型</dt><dd>{brand.category}</dd></div><div><dt>本期目标</dt><dd>{brand.intent}</dd></div></dl>
      <div className="entry-actions">
        <button className="entry-text-button profile-upload-link" type="button" onClick={onEdit}><Icon name="upload" /><span>上传更多品牌资料</span></button>
        <button className="flow-primary profile-gravity-action" type="button" onClick={onExplore}><span>进入引力匹配</span><Icon name="arrow" /></button>
      </div>
    </section>
    <section className="entry-stage branded-entry-stage" aria-label={`${brand.name}完整个人 IP`}>
      <div className="entry-avatar branded-entry-avatar">{brand.avatarDataUrl ? <img className="character" src={brand.avatarDataUrl} alt={`${brand.name}完整个人 IP`} /> : <WearableCharacter brand={brand} look={drawWearable(brand)} labelled />}</div>
    </section>
    <JourneyFooter current="profile" />
  </main>;
}
