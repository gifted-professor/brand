import { hash } from './hash';

// Hair is a styling vocabulary; it never changes the prototype's face or body.
export const HAIRSTYLES = [
  { id: 'bob', label: '侧分波波头', description: 'a chin-length side-parted bob with a softly swept fringe' },
  { id: 'bun', label: '高丸子头', description: 'a high round bun with a swept side fringe, exposing the ears and neck' },
  { id: 'ponytail', label: '高马尾', description: 'a high ponytail visibly curving beside the head, with a simple hair tie' },
  { id: 'waves', label: '蓬松波浪', description: 'shoulder-length loose waves with a gentle side part and clearly defined soft curves' },
  { id: 'pixie', label: '精灵短发', description: 'a short textured pixie cut with a side-swept fringe and exposed ears and neck' },
  { id: 'crop', label: '利落短发', description: 'a close-cropped sculpted cut, clean around the ears and nape' },
  { id: 'low-bun', label: '低盘发', description: 'a neat low coiled bun behind one ear with a smooth side part' },
  { id: 'double-bun', label: '双丸子头', description: 'two rounded space buns with a soft swept fringe, keeping the face open' },
  { id: 'low-pony', label: '低束马尾', description: 'a low tied ponytail flowing behind one shoulder' },
  { id: 'twin-tails', label: '双马尾', description: 'two soft ponytails falling beside the shoulders' },
  { id: 'braid', label: '侧编发', description: 'one thick interwoven side braid falling beside the shoulder' },
  { id: 'twin-braids', label: '双编发', description: 'two clearly interwoven braids with small ties, framing but not covering the face' },
  { id: 'long-straight', label: '垂顺长发', description: 'smooth long straight hair falling behind both shoulders with an open side part' },
  { id: 'curly', label: '蓬松卷发', description: 'a rounded silhouette of dense soft curls around the head, leaving the face unobscured' },
  { id: 'half-up', label: '半扎波浪', description: 'half-up hair gathered into a small top knot with soft shoulder-length waves' },
  { id: 'lob', label: '齐肩短发', description: 'a shoulder-length blunt lob with gently curved ends and a side part' },
] as const;
export type HairstyleId = typeof HAIRSTYLES[number]['id'];

/** Stable fallback when there is no brand brief. Content-aware selection lives in brandHair. */
export function brandHairstyle(name: string) {
  const identity = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  return HAIRSTYLES[hash(identity) % HAIRSTYLES.length];
}
