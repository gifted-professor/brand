import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { generateMockBrands } from '../data/mockBrands';
import { LegacyBrandCharacter as BrandCharacter } from '../components/BrandCharacter';
import { describeBrandCharacter, extractCapabilities, CHARACTER_PALETTES } from './character';
import { calculateMockRelation } from './relation';
import { createLocalCandidates } from './characterGenome';

const brands = generateMockBrands();
const brand = (id: string) => brands.find(item => item.id === id)!;

describe('Evidence-based character capabilities', () => {
  it('distinguishes design, manufacturing, materials and logistics without borrowing needs', () => {
    const expected = { 'memory-block': 'design', 'form-works': 'manufacturing', 'matter-matter': 'materials', 'fold-supply': 'packaging', 'line-of-work': 'distribution', 'clear-ledger': 'finance', 'quiet-type': 'sound', 'clay-county': 'craft' };
    for (const [id, primary] of Object.entries(expected)) expect(describeBrandCharacter(brand(id)).primary?.id).toBe(primary);
    const model = describeBrandCharacter(brand('memory-block'));
    expect(model.capabilities.map(item => item.id)).not.toContain('manufacturing');
    expect(model.needs.map(item => item.id)).toContain('manufacturing');
  });
  it('returns no invented tool for missing, unsupported, negated or aspirational capabilities', () => {
    for (const offers of ['', 'Consulting.', 'No manufacturing and logistics.', 'We are looking for product design.', 'We plan software development.', '不提供制造和物流。']) {
      expect(extractCapabilities(offers), offers).toEqual([]);
    }
    expect(extractCapabilities('No manufacturing, but product design.').map(item => item.id)).toEqual(['design']);
    expect(extractCapabilities('Redistribution analysis. Manufacturingly.')).toEqual([]);
    expect(describeBrandCharacter({ ...brand('memory-block'), offers: '' }).primary).toBeUndefined();
  });
  it.each([
    ['明确否定', '我们不会生产制造。我们无法提供物流。我们不具备软件开发。'],
    ['已暂停或停止', '我们暂停生产制造。我们停止包装业务。'],
    ['尚未具备', '我们尚未具备材料研发。我们暂未提供产品设计。'],
    ['将来计划', '拟开展生产制造。未来提供包装。明年开展软件开发。'],
    ['客户主体', '客户具备生产制造。客户拥有物流能力。'],
    ['合作方主体', '合作方负责产品设计。合作伙伴提供软件开发。'],
    ['供应商主体', '供应商的包装。第三方提供仓储。'],
    ['英文否定与停止', 'We cannot offer manufacturing. We stopped software development. We paused logistics.'],
    ['英文未来与主体', 'We will offer packaging. Our clients have manufacturing. Our partner provides product design.'],
    ['英文外包与所有格', "Manufacturing is provided by our supplier. Our partner's software development."],
  ])('rejects the bounded attack case: %s', (_label, text) => {
    expect(extractCapabilities(text)).toEqual([]);
  });
  it('preserves explicit current self-owned work and source order beside rejected third-party work', () => {
    expect(extractCapabilities('客户具备制造，我们提供产品设计。我们提供包装以及物流。').map(item => item.id)).toEqual(['design', 'packaging', 'distribution']);
    expect(extractCapabilities('Our partner provides manufacturing, but we offer product design for clients. We provide packaging.').map(item => item.id)).toEqual(['design', 'packaging']);
  });
  it('does not let a saved recipe turn a negative or third-party quote into owned equipment', () => {
    const base = brand('memory-block');
    const character = createLocalCandidates({ ...base, offers: 'Manufacturing.' })[0];
    for (const offers of ['我们不具备制造能力。', 'Our partner provides manufacturing.']) {
      const forged = { ...character, capabilities: [{ id: 'manufacturing', evidence: offers }] };
      expect(describeBrandCharacter({ ...base, offers, character: forged }).capabilities).toEqual([]);
    }
  });
  it('keeps source phrases and handles capitalization, Chinese and repeated matches', () => {
    expect(extractCapabilities('PRODUCT DESIGN, Product design.')).toEqual([{ id: 'design', label: 'Design', evidence: 'PRODUCT DESIGN' }]);
    expect(extractCapabilities('材料研发，陶瓷，软件开发。').map(item => item.id)).toEqual(['materials', 'craft', 'technology']);
    for (const item of brands) {
      const model = describeBrandCharacter(item);
      expect(model.primary, item.name).toBeDefined();
      for (const capability of model.capabilities) expect(item.offers).toContain(capability.evidence);
    }
  });
  it('preserves the visual identity and actual capabilities across focus, seed and need changes', () => {
    const source = brand('memory-block');
    const original = describeBrandCharacter(source);
    const changed = describeBrandCharacter({ ...source, characterSeed: -999, needs: 'Manufacturing and logistics.', intent: 'Become a finance company.' });
    expect(changed.palette).toEqual(original.palette);
    expect(changed.capabilities).toEqual(original.capabilities);
    for (const item of brands) expect(CHARACTER_PALETTES).toContain(describeBrandCharacter(item).palette);
    expect(calculateMockRelation(source, brand('form-works'))).toEqual(calculateMockRelation({ ...source, characterSeed: 999999 }, brand('form-works')));
  });
  it('unmounts dormant artwork, uses one span at marker LOD and removes texture at simple LOD', () => {
    const render = (lod: 'full' | 'simple' | 'marker' | 'dormant') => renderToStaticMarkup(createElement(BrandCharacter, { brand: brand('memory-block'), lod }));
    expect(render('dormant')).toBe('');
    expect(render('marker')).not.toContain('<svg');
    expect(render('marker').match(/<span/g)).toHaveLength(1);
    expect(render('simple')).not.toContain('<pattern');
    expect(render('full')).toContain('<pattern');
    expect(render('simple').length).toBeLessThan(render('full').length);
    for (const lod of ['full', 'simple'] as const) {
      expect(render(lod)).toContain('data-capability="design"');
      expect(render(lod)).not.toMatch(/<filter|<image|<foreignObject|<animate/);
    }
  });
});
