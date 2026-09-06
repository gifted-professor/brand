export function FlowIcon({ name }: { name: 'gravity' | 'cards' | 'close' | 'upload' }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'gravity' ? <><circle cx="12" cy="12" r="2.5" /><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)" /><circle cx="18" cy="6" r="1.6" fill="currentColor" /></> : null}
    {name === 'cards' ? <><rect x="8" y="4" width="12" height="17" rx="2" /><path d="m5 18-3-13a2 2 0 0 1 1.5-2.4L12 1M14 9l2 3-2 3-2-3Z" /></> : null}
    {name === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : null}
    {name === 'upload' ? <path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7" /> : null}
  </svg>;
}
