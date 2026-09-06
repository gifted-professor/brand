import { useId } from 'react';
import type { Brand, LOD } from '../domain/types';
import { deriveAccessoryPlan } from '../domain/accessoryRules';

/** Fixed reference character. Evidence changes equipment, never anatomy or identity. */
export function AccessoryCharacter({ brand, lod = 'full', labelled = false, asOf }: { brand: Brand; lod?: LOD; labelled?: boolean; asOf?: string }) {
  const plan = deriveAccessoryPlan(brand, brand.profile?.accessoryEvidence, asOf);
  const gradient = `equipment-${useId().replace(/:/g, '')}`;
  const simple = lod === 'simple';
  const label = `${brand.name} · ${plan.primary ? `${plan.primary.label} · ${plan.primary.statusLabel}` : '基础角色 · 能力待了解'}`;
  const equipment = (entry: NonNullable<typeof plan.primary>, secondary = false) => {
    const size = secondary ? 40 : entry.level === 3 ? 92 : entry.level === 2 ? 82 : 68;
    return <g key={entry.id} transform={`translate(${secondary ? 22 : 155} ${secondary ? 173 : 172}) scale(${size / 100})`} className={entry.level < 2 ? 'equipment-outline' : ''} data-accessory={entry.id} data-evidence-level={entry.level}>
      <title>{`${entry.label}：${entry.statusLabel}。${entry.reason}`}</title>
      <g stroke="#202b35" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fill={entry.level < 2 ? '#FFFFFF' : `url(#${gradient})`}>
        {entry.id === 'creative' ? <><path d="M13 13h68v81H13Z" /><path d="M34 8h27v12H34Z" fill="#2457F5"/><path d="M25 41h36M25 53h25M25 66h29" fill="none"/><path d="m73 63 13-44 9 3-13 44-8 10Z" fill="#2457F5"/></> :
        entry.id === 'making' ? <><path d="M8 42h84v49H8Z"/><path d="M8 42 21 28h60l11 14Z"/><path d="M31 27V13h36v14" fill="none"/><path d="M8 57h84M45 52v15h12V52"/><path d="m23 75 5 5 9-13" fill="none"/></> :
        entry.id === 'materials' ? <><path d="M13 20h24v70H13Z" transform="rotate(-25 26 80)"/><path d="M27 12h25v77H27Z" transform="rotate(-8 40 80)"/><path d="M46 12h26v78H46Z" transform="rotate(13 59 80)"/><path d="M66 23h25v69H66Z" transform="rotate(28 78 80)" fill="#2457F5"/><circle cx="50" cy="81" r="5" fill="#202b35"/></> :
        entry.id === 'technology' ? <><rect x="10" y="9" width="80" height="87" rx="13"/><rect x="20" y="22" width="60" height="57" rx="4" fill="#2457F5"/><path d="M39 37h22v22H39ZM45 32v5m10-5v5m-10 22v5m10-5v5M34 43h5m22 0h5m-32 10h5m22 0h5" stroke="#FFFFFF" fill="none"/><path d="M44 87h12"/></> :
        entry.id === 'distribution' ? <><path d="M20 5v77h73" fill="none"/><path d="M29 41h55v38H29ZM36 10h42v29H36Z"/><path d="M55 11v12h9V11M50 42v15h12V42" fill="#2457F5"/><circle cx="29" cy="91" r="7" fill="#202b35"/><circle cx="79" cy="91" r="7" fill="#202b35"/></> :
        entry.id === 'gathering' ? <><path d="M9 79 49 64l41 17-41 15Z"/><path d="M30 72V15h47l-8 16 8 16H30" fill="#2457F5"/><circle cx="20" cy="58" r="7"/><path d="M12 76v-7q8-9 16 0v7M60 76v-7q8-9 16 0v7" fill="none"/><circle cx="68" cy="58" r="7"/></> :
        entry.id === 'story' ? <><path d="M7 33h86v58H7Z"/><path d="m7 19 78-13 3 16L10 35Z" fill="#2457F5"/><path d="m26 17 9 12m15-16 9 12m14-15 9 12" stroke="#FFFFFF"/><path d="m41 46 22 14-22 15Z" fill="#2457F5"/></> : <><path d="M14 11h70v81H14Z"/><path d="M29 11v80M42 30h28M42 43h28"/><rect x="47" y="52" width="43" height="45" rx="6" fill="#2457F5"/><path d="M57 63h23M58 76h2m11 0h2m-15 11h2m11 0h2" stroke="#FFFFFF"/></>}
      </g>
      {entry.pending ? <g><circle cx="89" cy="10" r="13" fill="#FFFFFF" stroke="#111111" strokeWidth="2"/><text x="89" y="15" textAnchor="middle" fontSize="18" fill="#111111">?</text></g> : null}
    </g>;
  };
  return <svg className={`character brand-character accessory-character ${simple ? 'character-mid' : 'character-near'}`} viewBox="0 0 256 320" role={labelled ? 'img' : undefined} aria-label={labelled ? label : undefined} aria-hidden={labelled ? undefined : true} data-capability={plan.primary?.capabilityId ?? 'unknown'}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FFFFFF"/><stop offset="1" stopColor="#c7cedc"/></linearGradient></defs>
    <image href={brand.avatarDataUrl || '/avatars/base-reference-v2.png'} x="25" y="0" width="205" height="315" preserveAspectRatio="xMidYMid meet" />
    {plan.secondary && !simple ? equipment(plan.secondary, true) : null}
    {plan.primary ? equipment(plan.primary) : null}
  </svg>;
}
