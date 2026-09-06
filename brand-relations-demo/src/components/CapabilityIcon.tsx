import type { CapabilityId } from '../engines/character';

const GLYPHS: Record<CapabilityId | 'unknown', string> = {
  design: 'M4 20l4-1L20 7l-3-3L5 16l-1 4ZM14 7l3 3M4 20h16',
  manufacturing: 'M3 20V10l6 3V8l6 4V4h5v16H3ZM6 16h1m4 0h1m4 0h1',
  materials: 'M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  craft: 'M8 3h8M9 3v5C9 11 4 12 4 16c0 4 4 5 8 5s8-1 8-5c0-4-5-5-5-8V3M5 14h14',
  technology: 'M6 6h12v12H6V6ZM9 9h6v6H9V9ZM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',
  packaging: 'M3 8h18v13H3V8ZM2 8l3-5h14l3 5M12 3v10m-3 0h6',
  distribution: 'M2 6h12v11H2V6ZM14 10h4l4 4v3h-8M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4m13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  space: 'M3 21V8l9-5 9 5v13H3ZM3 8l9 5 9-5M12 13v8M7 11v6m10-6v6',
  culture: 'M3 8h18L12 3 3 8ZM5 10v8m7-8v8m7-8v8M3 21h18M2 18h20',
  content: 'M3 4h14v17H3V4ZM7 8h6m-6 4h6m-6 4h6M17 8h4v13h-4',
  community: 'M8 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6M2 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 5 5v2',
  events: 'M4 7h16v14H4V7ZM8 3v7m8-7v7M4 12h16M9 16l2 2 4-3',
  food: 'M4 8h13v5a6.5 6.5 0 0 1-13 0V8ZM17 9h3a3 3 0 0 1 0 6h-3M2 22h18M8 2v3m5-3v3',
  textiles: 'M8 3H4L1 8l5 3v10h12V11l5-3-3-5h-4a4 4 0 0 1-8 0ZM9 12l6 5m-6 0 6-5',
  digital: 'M3 3h18v14H3V3ZM9 9l2 12 3-4 5-2-10-6Z',
  finance: 'M5 2h14v20H5V2ZM8 6h8M8 10h1m5 0h1m-7 4h1m5 0h1m-7 4h1m5 0h1',
  sound: 'M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4',
  prototype: 'M12 2 3 7v10l9 5 9-5V7l-9-5ZM3 7l9 5 9-5M12 12v10M8 5l9 5',
  unknown: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 9a3 3 0 1 1 5 2l-2 2m0 4h.01',
};

export function CapabilityGlyph({ id }: { id: CapabilityId | 'unknown' }) {
  return <path d={GLYPHS[id]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />;
}
export function CapabilityIcon({ id }: { id: CapabilityId | 'unknown' }) {
  return <svg className="capability-icon" viewBox="0 0 24 24" aria-hidden="true"><CapabilityGlyph id={id} /></svg>;
}
