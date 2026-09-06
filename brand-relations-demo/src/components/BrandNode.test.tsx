import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateMockBrands } from '../data/mockBrands';
import type { LOD, SceneNode } from '../domain/types';
import { BrandNode } from './BrandNode';

const brand = generateMockBrands()[0];
const node: SceneNode = { brand, isFocus: false, fit: 72, position: { brandId: brand.id, x: 0, y: 0, radius: 0 } };
const render = (lod: LOD) => renderToStaticMarkup(createElement(BrandNode, {node, lod, selected: false, onSelect: () => {}}));

describe('Gravity semantic zoom', () => {
  it('progressively reveals identity, portrait, ability and score', () => {
    expect(render('dormant')).not.toContain('<button');
    expect(render('marker')).not.toContain('class="brand-name"');
    expect(render('signature')).toContain('brand-signature');
    expect(render('signature')).toContain('class="brand-name"');
    expect(render('signature')).not.toContain('<image');
    expect(render('portrait')).toContain('brand-bust');
    expect(render('portrait')).not.toContain('node-capability');
    expect(render('blurred')).not.toContain('node-capability');
    expect(render('blurred')).toContain('semantic-character');
    expect(render('simple')).not.toContain('/100');
    expect(render('full')).toContain('/100');
    const exploratory = renderToStaticMarkup(createElement(BrandNode, {node: {...node, exploratory: true}, lod: 'full', selected: false, onSelect: () => {}}));
    expect(exploratory).toContain('待探索');
    expect(exploratory).not.toContain('/100');
  });
  it('preserves selection and accessible identity across all visible stages', () => {
    for (const lod of ['marker', 'portrait', 'full'] as const) {
      const html = renderToStaticMarkup(createElement(BrandNode, {node, lod, selected: true, onSelect: () => {}}));
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain(`data-brand-id="${brand.id}"`);
      expect(html).toContain(`aria-label="${brand.name},`);
    }
  });
});
