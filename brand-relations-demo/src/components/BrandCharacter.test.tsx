import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateMockBrands } from '../data/mockBrands';
import { deriveBrandAppearance } from '../domain/brandAppearance';
import { BrandCharacter } from './BrandCharacter';

describe('consistent character identity', () => {
  it('uses the matching character in both portrait and detail views', () => {
    for (const brand of generateMockBrands()) {
      const expected = deriveBrandAppearance(brand).signature;
      for (const lod of ['portrait', 'full'] as const) {
        expect(renderToStaticMarkup(createElement(BrandCharacter, { brand, lod }))).toContain(`data-character-signature="${expected}"`);
      }
    }
  });
  it('preserves generated clothing in full detail while portraits render only the same head', () => {
    const url = '/api/collider/avatar-assets/12345678-1234-1234-1234-123456789012.png';
    const brand = {
      ...generateMockBrands()[0],
      profile: { documents: [], evidence: [], gaps: [], summary: '', source: 'local' as const, wearable: { url, source: 'generated' as const } },
    };
    for (const lod of ['portrait', 'full'] as const) {
      const html = renderToStaticMarkup(createElement(BrandCharacter, { brand, lod }));
      expect(html).toContain(`data-character-signature="${deriveBrandAppearance(brand).signature}"`);
      if (lod === 'full') expect(html).toContain(`href="${url}"`);
      else expect(html).not.toContain('data-prototype-layer="generated-clothing-only"');
    }
  });
});
