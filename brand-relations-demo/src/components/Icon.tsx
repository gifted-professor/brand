export function Icon({ name }: { name: 'back' | 'plus' | 'minus' | 'reset' | 'regenerate' | 'arrow' | 'orbit' | 'home' | 'cards' | 'close' | 'upload' | 'sparkles' | 'document' }) {
  return <svg width={name === 'orbit' ? 44 : 18} height={name === 'orbit' ? 44 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'orbit' ? 0.65 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'back' ? <path d="M20 12H4m6-6-6 6 6 6" /> : null}
    {name === 'plus' ? <path d="M5 12h14M12 5v14" /> : null}
    {name === 'minus' ? <path d="M5 12h14" /> : null}
    {name === 'reset' ? <><circle cx="12" cy="12" r="6" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></> : null}
    {name === 'home' ? <path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10" /> : null}
    {name === 'regenerate' ? <><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6" /></> : null}
    {name === 'arrow' ? <path d="M4 12h16m-6-6 6 6-6 6" /> : null}
    {name === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : null}
    {name === 'cards' ? <><rect x="8" y="5" width="12" height="16" rx="2" /><path d="m5 18-3-13a2 2 0 0 1 1.5-2.3L12 1m2 8v8m-3-4h6" /></> : null}
    {name === 'sparkles' ? <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z" /><path d="M20 2v4m-2-2h4" /></> : null}
    {name === 'document' ? <><path d="M6 2h8l5 5v15H6Z" /><path d="M14 2v6h5M9 13h7m-7 4h5" /></> : null}
    {name === 'upload' ? <path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7" /> : null}
    {name === 'orbit' ? <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="12" ry="4" transform="rotate(-35 12 12)" /><circle cx="12" cy="12" r="3.3" fill="currentColor" stroke="none" /><circle cx="21" cy="6" r="1.4" fill="currentColor" stroke="none" /></> : null}
  </svg>;
}
