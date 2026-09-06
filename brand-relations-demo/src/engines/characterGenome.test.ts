import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PART_IDS } from '../domain/characterRecipe';
import type { CompanyBrief } from '../domain/characterRecipe';
import { candidateBrand, createLocalCandidates, loadCustomBrands, PARTS, partSize, validateBrief, validateCandidate, validateCandidates } from './characterGenome';
import { LegacyBrandCharacter as BrandCharacter } from '../components/BrandCharacter';
import { describeBrandCharacter } from './character';
import { calculateMockRelation } from './relation';
import { generateMockBrands } from '../data/mockBrands';

const brief: CompanyBrief = { name: '苔屿', category: '材料工作室', offers: '产品设计、材料研发，原型制作，小批量制造，内容制作。', needs: '需要软件开发和物流', identity: '自然、温暖' };
describe('Company character generation', () => {
  it('creates three distinct silhouettes with the same capability meaning and no ability borrowed from needs', () => {
    const candidates = createLocalCandidates(brief);
    expect(new Set(candidates.map(item => item.silhouette)).size).toBe(3);
    for (const candidate of candidates) {
      expect(validateCandidate(candidate, brief, 'local')).toEqual(candidate);
      expect(candidate.parts).toEqual(candidates[0].parts);
      expect(candidate.parts.find(part => part.id === 'antenna')!.emphasis).toBe(0);
      expect(candidate.parts.find(part => part.id === 'head')!.emphasis).toBeGreaterThan(.5);
      expect(candidate.capabilities.some(item => item.id === 'technology')).toBe(false);
    }
    const reroll = createLocalCandidates(brief, 1);
    expect(reroll[0].parts).toEqual(candidates[0].parts);
    expect(reroll[0].signature).not.toBe(candidates[0].signature);
  });
  it('changes actual geometry with ability input, within bounds even at extremes', () => {
    const simple = createLocalCandidates({ ...brief, offers: '产品设计。' })[0];
    const complex = createLocalCandidates(brief)[0];
    expect(partSize(complex, 'head')).toBeGreaterThan(partSize(simple, 'head'));
    for (const extreme of [0, 1]) {
      const recipe = { ...complex, parts: complex.parts.map(part => ({ ...part, emphasis: extreme })) };
      for (const part of PARTS) expect(partSize(recipe, part.id)).toBe(part.range[extreme]);
      const svg = renderToStaticMarkup(createElement(BrandCharacter, { brand: candidateBrand(brief, recipe) }));
      for (const id of PART_IDS) expect(svg).toContain(`data-part="${id}"`);
      expect(svg).not.toMatch(/NaN|Infinity|<filter|<image|<animate/);
    }
    const a = renderToStaticMarkup(createElement(BrandCharacter, { brand: candidateBrand(brief, simple) }));
    const b = renderToStaticMarkup(createElement(BrandCharacter, { brand: candidateBrand(brief, complex) }));
    expect(a).not.toEqual(b);
  });
  it('rejects unsupported AI claims, unsafe geometry, missing parts and inconsistent candidates', () => {
    const candidate = createLocalCandidates(brief)[0];
    expect(() => validateCandidate({ ...candidate, palette: 99 }, brief, 'ai')).toThrow();
    expect(() => validateCandidate({ ...candidate, parts: candidate.parts.slice(1) }, brief, 'ai')).toThrow();
    expect(() => validateCandidate({ ...candidate, parts: candidate.parts.map(part => ({ ...part, emphasis: NaN })) }, brief, 'ai')).toThrow();
    expect(() => validateCandidate({ ...candidate, capabilities: [{ id: 'technology', evidence: '软件开发' }] }, brief, 'ai')).toThrow();
    expect(() => validateCandidate({ ...candidate, capabilities: [{ id: 'manufacturing', evidence: 'manufacturing' }] }, { ...brief, offers: 'No manufacturing.' }, 'ai')).toThrow();
    expect(() => validateCandidate({ ...candidate, parts: candidate.parts.map(part => ({ ...part, emphasis: 1 })) }, brief, 'ai')).toThrow();
    expect(() => validateCandidates([candidate, candidate, candidate], brief)).toThrow();
    const candidates = createLocalCandidates(brief);
    expect(validateCandidates(candidates, brief).every(item => item.source === 'ai')).toBe(true);
  });
  it('validates form input and ignores corrupt stored records without losing valid companies', () => {
    expect(() => validateBrief({ ...brief, name: ' ' })).toThrow();
    expect(() => validateBrief({ ...brief, offers: '短' })).toThrow();
    expect(() => validateBrief({ ...brief, offers: 'x'.repeat(3001) })).toThrow();
    const company = candidateBrand(brief, createLocalCandidates(brief)[0], 'company-123');
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([null, {}, company, { ...company, id: 'memory-block' }]) });
    expect(loadCustomBrands()).toEqual([company]);
    vi.stubGlobal('localStorage', { getItem: () => '{broken' });
    expect(loadCustomBrands()).toEqual([]);
    vi.unstubAllGlobals();
  });
  it('preserves identity, capabilities and scores across art variants and LOD', () => {
    const candidates = createLocalCandidates(brief);
    const a = candidateBrand(brief, candidates[0], 'company-123');
    const b = candidateBrand(brief, candidates[1], 'company-123');
    const target = generateMockBrands()[1];
    expect(calculateMockRelation(a, target)).toEqual(calculateMockRelation(b, target));
    expect(describeBrandCharacter(a).capabilities).toEqual(describeBrandCharacter(b).capabilities);
    expect(renderToStaticMarkup(createElement(BrandCharacter, { brand: a, lod: 'dormant' }))).toBe('');
    expect(renderToStaticMarkup(createElement(BrandCharacter, { brand: a, lod: 'marker' }))).not.toContain('svg');
    expect(renderToStaticMarkup(createElement(BrandCharacter, { brand: a, lod: 'simple' }))).not.toContain('figure-signature');
  });
});
