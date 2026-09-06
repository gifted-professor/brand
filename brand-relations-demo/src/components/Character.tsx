import type { LOD } from '../domain/types';

const colors = ['#294b3a', '#6d8b64', '#b17b57', '#8a8270', '#48777a', '#b29156'];
/** Asset boundary: replace this function with a real character asset renderer. */
export function renderPlaceholderCharacter(seed: number, lod: LOD, isFocus = false) {
  const color = isFocus ? colors[0] : colors[seed % colors.length];
  if (lod === 'dormant') return null;
  if (lod === 'marker') return <span className="far-marker" aria-hidden="true" />;
  if (lod === 'simple') return (
    <svg className="character character-mid" viewBox="0 0 64 84" aria-hidden="true">
      <circle cx="32" cy="15" r="8" fill="#26372c" />
      <path d="M24 29h16l7 30H17z" fill={color} />
      <path d="m24 34-9 18m25-18 9 18M26 60v15m12-15v15" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
  const variant = seed % 4;
  return (
    <svg className="character character-near" viewBox="0 0 80 104" aria-hidden="true">
      <ellipse cx="40" cy="99" rx="22" ry="3" fill="#294b3a" opacity=".09" />
      <path d="M33 72v22h-7m22-22v22h7" stroke="#26372c" strokeWidth="6" fill="none" />
      <path d={variant % 2 ? 'M28 42 16 57l-6-8m43-7 13 15 5-11' : 'M28 42 13 31m39 11 15-11'} stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d={variant === 2 ? 'M28 38h24l6 34H22z' : 'M27 38h26v35H27z'} fill={color} />
      <circle cx="40" cy="20" r="13" fill={variant === 1 ? '#e0ccab' : '#e8d9bc'} />
      <path d={variant === 3 ? 'M27 21C24 1 54 1 53 22l-8-12-6 10z' : 'M26 19a14 14 0 0 1 28 0z'} fill="#26372c" />
      {variant === 0 ? <path d="M22 17h36M31 13V8h18v5" stroke={color} strokeWidth="5" fill={color} /> : null}
      <circle cx="35" cy="22" r="1.3" fill="#26372c" /><circle cx="45" cy="22" r="1.3" fill="#26372c" />
      <path d="M37 28q3 3 6 0" fill="none" stroke="#26372c" strokeWidth="1.3" />
      {variant === 1 ? <><path d="M30 38v24h20V38" stroke="#e8d9bc" strokeWidth="2" fill="none" /><path d="M35 48h10v8H35z" fill="#e8d9bc" /></> : null}
      {variant === 2 ? <path d="m65 27 6-8m-7 0 8 8" stroke="#26372c" strokeWidth="3" /> : null}
      {variant === 3 ? <path d="M9 40h12v15H9z" fill="#e8d9bc" stroke="#26372c" strokeWidth="1.5" /> : null}
    </svg>
  );
}
