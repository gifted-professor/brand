import type { Brand } from '../domain/types';
import { hash } from '../domain/hash';

/** Presentation vocabulary. Never feeds relation scores or derives an offer from a need. */
export const CAPABILITY_CATALOG = [
  { id: 'design', label: 'Design', terms: ['concept development', 'product design', 'visual direction', '概念设计', '产品设计', '视觉设计'] },
  { id: 'manufacturing', label: 'Manufacturing', terms: ['small-batch manufacturing', 'manufacturing', 'production engineering', 'furniture production', '小批量制造', '生产制造', '制造'] },
  { id: 'materials', label: 'Materials', terms: ['material development', 'sustainable materials', 'material research', '材料研发', '可持续材料', '材料研究'] },
  { id: 'craft', label: 'Craft', terms: ['traditional craft', 'ceramics', '传统工艺', '手工艺', '陶瓷'] },
  { id: 'technology', label: 'Technology', terms: ['ai technology', 'software development', 'electronics', '人工智能', '软件开发', '电子技术'] },
  { id: 'packaging', label: 'Packaging', terms: ['packaging', '包装'] },
  { id: 'distribution', label: 'Distribution', terms: ['distribution', 'logistics', 'warehousing', '渠道分销', '物流', '仓储'] },
  { id: 'space', label: 'Spaces', terms: ['retail space', 'spatial design', '零售空间', '空间设计'] },
  { id: 'culture', label: 'Culture', terms: ['cultural storytelling', 'exhibition curation', '文化叙事', '展览策划', '策展'] },
  { id: 'content', label: 'Content', terms: ['content production', 'publishing', '内容制作', '出版'] },
  { id: 'community', label: 'Community', terms: ['community building', '社群运营', '社区营造'] },
  { id: 'events', label: 'Events', terms: ['event production', '活动制作', '活动策划'] },
  { id: 'food', label: 'Food & drink', terms: ['food development', 'tea sourcing', 'coffee roasting', 'food sourcing', '食品研发', '咖啡烘焙', '茶叶采购'] },
  { id: 'textiles', label: 'Textiles', terms: ['textile development', '纺织开发', '纺织研发'] },
  { id: 'digital', label: 'Interaction', terms: ['digital interaction', '数字交互', '交互设计'] },
  { id: 'finance', label: 'Finance', terms: ['tax reporting', 'audit preparation', 'payroll', 'bookkeeping', 'compliance training', '税务申报', '审计', '薪酬', '财税'] },
  { id: 'sound', label: 'Sound', terms: ['sound design', '声音设计', '音效设计'] },
  { id: 'prototype', label: 'Prototyping', terms: ['prototyping', '原型制作', '打样'] },
] as const;
export type CapabilityId = typeof CAPABILITY_CATALOG[number]['id'];
export interface Capability {
  id: CapabilityId;
  label: string;
  evidence: string;
}
export type CharacterStyle = 'facet' | 'halftone';

// A bounded, curated palette. Seed cannot randomize anatomy, equipment or capability.
export const CHARACTER_PALETTES = [
  { ink: '#253e35', mid: '#728c72', light: '#d6dfc5', accent: '#c39758' },
  { ink: '#304856', mid: '#72949c', light: '#d0e0db', accent: '#b78966' },
  { ink: '#59423b', mid: '#bd927b', light: '#efdbc4', accent: '#718b77' },
  { ink: '#45415b', mid: '#9790a9', light: '#e1dceb', accent: '#ad945c' },
  { ink: '#514a35', mid: '#a59b68', light: '#e9e3bf', accent: '#748c8f' },
  { ink: '#344b4d', mid: '#7a9d91', light: '#dae5d4', accent: '#b58a73' },
] as const;

// Conservative phrase guards, not a general language or ownership inference model.
// An ambiguous clause stays unknown; a later explicit self-owned clause can still qualify.
const NON_CURRENT_CLAIM = /\b(?:no|not|never|without|lack|lacks|need|needs|seeking|looking for|want|wants|wish|plan|plans|planned|planning|cannot|can't|don't|doesn't|unable|will|future|upcoming|stopped|paused|suspended|ceased|discontinued|formerly|previously)\b|不提供|不具备|没有|缺乏|需要|寻找|希望|计划|不会|不能|无法|尚未|暂未|未具备|未提供|停止|暂停|拟开展|拟提供|拟建立|拟进行|打算|将要|将开展|未来|明年/iu;
const THIRD_PARTY_CLAIM = /(?:客户|合作方|合作伙伴|供应商|第三方|竞品|其他品牌)(?:提供|拥有|具备|负责|可以|可|的|能够|能|承接)|\b(?:(?:our|their|the|a)\s+)?(?:customers?|clients?|partners?|suppliers?|vendors?|third[- ]part(?:y|ies)|competitors?)(?:['’]s?\b|\s+(?:have|has|provide|provides|offer|offers|own|owns|handle|handles|deliver|delivers|perform|performs|can|speciali[sz]e|speciali[sz]es)\b)|\b(?:outsourc\w*|rel(?:y|ies|ied)\s+on|provided\s+by)\b[^.;。；]*\b(?:partners?|suppliers?|vendors?|third[- ]part(?:y|ies))\b/iu;
const isCurrentOwnClaim = (clause: string) => !NON_CURRENT_CLAIM.test(clause) && !THIRD_PARTY_CLAIM.test(clause);

/** Shared conservative boundary for capability and visual-product interpretation. */
export function currentOwnClauses(text: string): string[] {
  return text.split(/[.;。；!?\n]|\b(?:but|however)\b|但是|但(?=我们|我司|本品牌)/iu).map(value => value.trim()).filter(value => value && isCurrentOwnClaim(value));
}

/** Small explicit-phrase adapter for the demo, not a general natural-language inference model. */
export function extractCapabilities(text: string): Capability[] {
  const clauses = text.split(/[.;。；!?\n]|\b(?:but|however)\b|但是|但(?=我们|我司|本品牌)|[，,](?=\s*(?:我们|我司|本品牌|we\b|our company\b))/iu)
    .filter(isCurrentOwnClaim)
    .flatMap(value => value.split(/[，,、]|\band\b|以及|和/iu)).map(value => value.trim()).filter(Boolean);
  const matches = CAPABILITY_CATALOG.flatMap(entry => {
    let first = -1;
    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i];
      // Ambiguous, negated and aspirational clauses are omitted instead of inventing an ability.
      if (!isCurrentOwnClaim(clause)) continue;
      if (entry.terms.some(term => {
        const lower = clause.toLowerCase();
        const offset = lower.indexOf(term);
        if (offset < 0) return false;
        // Avoid matching fragments such as “redistribution” or “manufacturingly”.
        return /\p{Script=Han}/u.test(term) || ((!/[a-z]/i.test(lower[offset - 1] ?? '')) && !/[a-z]/i.test(lower[offset + term.length] ?? ''));
      })) { first = i; break; }
    }
    return first < 0 ? [] : [{ id: entry.id, label: entry.label, evidence: clauses[first], first }];
  });
  return matches.sort((a, b) => a.first - b.first).map(({ id, label, evidence }) => ({ id, label, evidence }));
}

export function describeBrandCharacter(brand: Brand) {
  const currentCapabilities = extractCapabilities(brand.offers);
  const capabilities: Capability[] = brand.character ? brand.character.capabilities.flatMap(capability => {
    // Stored/model recipes cannot bypass the current offer's negation/ownership guards.
    // Reuse the eligible source clause instead of trusting a potentially misleading quote.
    const current = currentCapabilities.find(item => item.id === capability.id);
    return current && brand.offers.includes(capability.evidence) ? [current] : [];
  }) : currentCapabilities;
  return {
    capabilities,
    primary: capabilities[0],
    palette: CHARACTER_PALETTES[brand.character?.palette ?? hash(brand.id) % CHARACTER_PALETTES.length],
    // Separate query: these are wanted abilities, never drawn as owned equipment.
    needs: extractCapabilities(brand.needs.replace(/\b(?:need|needs|seeking|looking for|want|wants)\b|需要|寻找/giu, '')),
  };
}
