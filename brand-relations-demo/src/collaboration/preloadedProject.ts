import type { Brand } from '../domain/types';
import { DEMO_BRANDS, initialBrief } from './fixtures';
import type { Project } from './model';

export const PRELOADED_COTTI_NAILONG_PROJECT_ID = 'project-00000000-0000-4000-8000-000000000002';

export function isCottiNailongPair(a: Pick<Brand, 'id'>, b: Pick<Brand, 'id'>) {
  return a.id !== b.id && [a.id, b.id].every(id => id === 'cotti-coffee' || id === 'nailong');
}

const createdAt = '2026-09-06T03:15:00.000Z';
const [cottiCoffee, nailong] = DEMO_BRANDS;

/**
 * Source-controlled demo snapshot. Its two channel images are loaded from
 * public assets, so opening the presentation never waits for image generation.
 */
export const PRELOADED_COTTI_NAILONG_PROJECT: Project = {
  id: PRELOADED_COTTI_NAILONG_PROJECT_ID,
  sequence: 1,
  revision: 1,
  createdAt,
  updatedAt: createdAt,
  brands: { a: cottiCoffee, b: nailong },
  invitation: {
    status: 'draft',
    version: 1,
    feedback: '',
    draft: initialBrief(cottiCoffee.brand, nailong.brand),
  },
  headlines: {
    a: '一杯日常，\n一起治愈。',
    b: '今天也要，\n奶一口好咖啡。',
  },
  channel: 'social',
  previews: [{
    id: 'preview-00000000-0000-4000-8000-000000000002',
    revision: 1,
    createdAt,
    source: 'ai',
    a: '/collaboration/cotti-nailong/cotti-channel-image2-v2.png',
    b: '/collaboration/cotti-nailong/nailoong-channel-image2-v1.png',
    model: '预生成图像素材',
  }],
  approvals: { a: false, b: false },
  notes: [],
};

export function preloadedCottiNailongProject(): Project {
  return structuredClone(PRELOADED_COTTI_NAILONG_PROJECT);
}
