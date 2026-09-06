import type { Brand } from './types';
import { brandWearable } from './wearables';

// Authored concept outfits for built-in demos only; never evidence of a product or licence.
const groups = {
  coffee: ['moss-tea', 'daybreak-coffee', 'hearth-foods', 'clay-county', 'lab-starbucks'],
  outdoor: ['wild-north', 'line-of-work', 'lab-north-face'],
  creative: ['memory-block', 'still-studio', 'signal-paper', 'afterhours-press', 'field-museum', 'strata-studio', 'little-myth', 'tiny-assembly', 'point-practice', 'quiet-type', 'lab-chanel'],
  jacket: ['form-works', 'latent-lab', 'circuit-house', 'bulk-union', 'lab-nike', 'lab-supreme'],
  scarf: ['matter-matter', 'soft-measure', 'loop-fibre', 'clear-ledger', 'lab-check-trench'],
  bag: ['fold-supply', 'common-objects', 'open-room', 'neighbourhood', 'lab-louis-vuitton', 'lab-adidas'],
} as const;
const concepts = new Map<string, string>(Object.entries(groups).flatMap(([look, ids]) => ids.map(id => [id, look] as const)));
const hairstyleLooks: Record<string, string> = {
  coffee: '/avatars/draw-v4-hair/coffee-bun.png',
  outdoor: '/avatars/draw-v4-hair/outdoor-ponytail.png',
  creative: '/avatars/draw-v4-hair/creative-waves.png',
  jacket: '/avatars/draw-v4-hair/jacket-pixie.png',
};
export function drawWearable(brand: Brand): ReturnType<typeof brandWearable> {
  const actual = brandWearable(brand);
  if (actual.source === 'generated') return actual;
  const concept = concepts.get(brand.id);
  if (!concept) return actual;
  const url = hairstyleLooks[concept] ?? `/avatars/wearables-v2/${concept}-final.png`;
  return { url, label: '品牌角色 · 概念穿搭', source: 'example' };
}
