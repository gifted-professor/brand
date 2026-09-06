import { validateDocuments } from '../domain/brandProfile';
import { hash } from '../domain/hash';
import type { Brand } from '../domain/types';
import { PART_IDS } from '../domain/characterRecipe';
import type { CharacterRecipe, CompanyBrief, PartId, Silhouette } from '../domain/characterRecipe';
import { CAPABILITY_CATALOG, extractCapabilities } from './character';

export const PARTS: { id: PartId; label: string; meaning: string; icon: typeof CAPABILITY_CATALOG[number]['id']; capabilities: string[]; range: [number, number]; measure: string }[] = [
  { id: 'head', label: '灵感头冠', meaning: '设计与研发', icon: 'design', capabilities: ['design', 'materials', 'prototype'], range: [22, 31], measure: '半径' },
  { id: 'body', label: '制作核心', meaning: '生产与专业交付', icon: 'manufacturing', capabilities: ['manufacturing', 'craft', 'packaging', 'food', 'textiles', 'finance'], range: [44, 64], measure: '宽度' },
  { id: 'antenna', label: '感知天线', meaning: '科技与数字交互', icon: 'technology', capabilities: ['technology', 'digital'], range: [5, 22], measure: '长度' },
  { id: 'legs', label: '行旅足部', meaning: '渠道与空间触达', icon: 'distribution', capabilities: ['distribution', 'space'], range: [21, 38], measure: '长度' },
  { id: 'arms', label: '连接双臂', meaning: '社群与活动连接', icon: 'community', capabilities: ['community', 'events'], range: [14, 30], measure: '伸展' },
  { id: 'cape', label: '叙事披风', meaning: '内容与文化表达', icon: 'culture', capabilities: ['culture', 'content', 'sound'], range: [12, 29], measure: '展开' },
];
export const SILHOUETTES: { id: Silhouette; name: string; description: string }[] = [
  { id: 'rounded', name: '温润伙伴', description: '圆润轮廓 · 安静、亲近' },
  { id: 'faceted', name: '棱面探索者', description: '几何切面 · 清晰、有构造感' },
  { id: 'petal', name: '有机精灵', description: '花瓣头冠 · 自然、轻盈' },
];
export const fingerprint = (brief: CompanyBrief) => hash([brief.name, brief.category, brief.offers, brief.identity].join('|'));
function positiveEvidence(offers: string, evidence: string) {
  const clauses = offers.split(/[.;。；!?\n]|\b(?:but|however)\b|但是/iu);
  return clauses.some(clause => clause.includes(evidence) && !/\b(?:no|not|never|without|lack|lacks|need|needs|seeking|looking for|want|wants|wish|plan|plans|cannot|can't|don't|doesn't|unable)\b|不提供|不具备|没有|缺乏|需要|寻找|希望|计划/iu.test(clause));
}
export function validateBrief(value: unknown, allowSparse = false): CompanyBrief {
  if (!value || typeof value !== 'object') throw new Error('请填写公司资料。');
  const raw = value as Record<string, unknown>;
  const result = {} as CompanyBrief;
  for (const key of ['name', 'category', 'offers', 'needs', 'identity'] as const) {
    if (typeof raw[key] !== 'string' || raw[key].length > (key === 'name' ? 80 : 3000)) throw new Error('资料格式不正确，或文字过长。');
    result[key] = raw[key].trim();
  }
  if (!result.name || (!allowSparse && result.offers.length < 8)) throw new Error('请填写公司名称，以及至少 8 个字符的已有能力描述。');
  return result;
}
export function createLocalCandidates(brief: CompanyBrief, variation = 0): CharacterRecipe[] {
  const capabilities = extractCapabilities(brief.offers);
  const parts = PARTS.map(part => {
    const matched = capabilities.filter(capability => part.capabilities.includes(capability.id));
    return { id: part.id, emphasis: matched.length ? Math.min(.9, .4 + matched.length * .18) : 0, evidence: [...new Set(matched.map(capability => capability.evidence))].join('；') };
  });
  const seed = fingerprint(brief);
  return SILHOUETTES.map((shape, index) => ({ version: 1, source: 'local', name: shape.name,
    silhouette: shape.id, palette: (seed + index * 2 + variation) % 6, signature: hash(`${seed}:${variation}:${index}`), parts,
    capabilities: capabilities.map(({ id, evidence }) => ({ id, evidence })),
  }));
}

/** Accept only bounded geometry and source-backed statements; the model never emits SVG/code. */
export function validateCandidate(value: unknown, brief: CompanyBrief, source: 'ai' | 'local'): CharacterRecipe {
  if (!value || typeof value !== 'object') throw new Error('形象数据格式不正确。');
  const raw = value as Record<string, unknown>;
  if (!SILHOUETTES.some(shape => shape.id === raw.silhouette) || !Number.isInteger(raw.palette) || Number(raw.palette) < 0 || Number(raw.palette) > 5 || !Number.isSafeInteger(raw.signature) || Number(raw.signature) < 0) throw new Error('形象样式超出可用范围。');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 32) throw new Error('形象名称不正确。');
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length > 18 || !Array.isArray(raw.parts) || raw.parts.length !== 6) throw new Error('形象缺少完整的能力或部件。');
  const capabilities = raw.capabilities.map((item: unknown) => {
    const cap = item as Record<string, unknown>;
    if (!cap || !CAPABILITY_CATALOG.some(entry => entry.id === cap.id) || typeof cap.evidence !== 'string' || cap.evidence.length < 2 || !positiveEvidence(brief.offers, cap.evidence)) throw new Error('能力描述缺少公司资料中的明确已有能力依据。');
    return { id: String(cap.id), evidence: cap.evidence };
  });
  if (new Set(capabilities.map(cap => cap.id)).size !== capabilities.length) throw new Error('能力项重复。');
  const parts = PART_IDS.map(id => {
    const found = (raw.parts as unknown[]).filter(item => item && (item as Record<string, unknown>).id === id);
    const part = found[0] as Record<string, unknown>;
    if (found.length !== 1 || typeof part.emphasis !== 'number' || !Number.isFinite(part.emphasis) || part.emphasis < 0 || part.emphasis > 1 || typeof part.evidence !== 'string') throw new Error('部件比例超出可用范围。');
    const matches = capabilities.filter(cap => PARTS.find(item => item.id === id)!.capabilities.includes(cap.id));
    // The quoted evidence displayed to the user is rebuilt from validated offer evidence.
    if (part.emphasis > 0 && !matches.length) throw new Error('部件变化没有对应的已有能力依据。');
    return { id, emphasis: part.emphasis, evidence: [...new Set(matches.map(cap => cap.evidence))].join('；') };
  });
  return { version: 1, source, name: raw.name.trim(), silhouette: raw.silhouette as Silhouette, palette: Number(raw.palette), signature: Number(raw.signature), parts, capabilities };
}
export function validateCandidates(value: unknown, brief: CompanyBrief): CharacterRecipe[] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('AI 没有返回完整的 3 个候选形象，请重试。');
  const candidates = value.map(item => validateCandidate(item, brief, 'ai'));
  if (new Set(candidates.map(item => item.silhouette)).size !== 3) throw new Error('候选轮廓过于相似，请重新生成。');
  const shared = JSON.stringify(candidates[0].parts);
  if (candidates.some(candidate => JSON.stringify(candidate.parts) !== shared || JSON.stringify(candidate.capabilities) !== JSON.stringify(candidates[0].capabilities))) throw new Error('候选形象的能力解读不一致，请重新生成。');
  return candidates;
}
export function partSize(recipe: CharacterRecipe, id: PartId) {
  const definition = PARTS.find(part => part.id === id)!;
  const emphasis = recipe.parts.find(part => part.id === id)?.emphasis ?? 0;
  return Math.round((definition.range[0] + (definition.range[1] - definition.range[0]) * Math.max(0, Math.min(1, emphasis))) * 10) / 10;
}
export function candidateBrand(brief: CompanyBrief, recipe: CharacterRecipe, id = 'preview'): Brand {
  return { ...brief, id, summary: brief.category, intent: brief.needs, audience: '', constraints: '', characterSeed: recipe.signature, character: recipe };
}

const STORAGE_KEY = 'brand-gravity-characters-v1';
export function loadCustomBrands(): Brand[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.slice(0, 40).flatMap(item => {
      try {
        const documents = item.profile ? validateDocuments(item.profile.documents) : undefined;
        const brief = validateBrief(item, Boolean(documents));
        if (typeof item.id !== 'string' || !item.id.startsWith('company-') || item.id.length > 90 || item.character?.version !== 1) return [];
        const brand = candidateBrand(brief, validateCandidate(item.character, brief, item.character.source === 'ai' ? 'ai' : 'local'), item.id);
        for (const key of ['intent', 'audience', 'constraints', 'evidence'] as const) {
          if (typeof item[key] === 'string' && item[key].length <= 3000) brand[key] = item[key];
        }
        for (const key of ['intent', 'audience', 'constraints', 'supportingEvidence'] as const) {
          if (typeof item[key] === 'string' && item[key].length <= (key === 'supportingEvidence' ? 8000 : 3000)) brand[key] = item[key];
        }
        if (documents && ['ai', 'local'].includes(item.profile.source) && Array.isArray(item.profile.gaps) && Array.isArray(item.profile.evidence)) brand.profile = { ...item.profile, documents };
        if (typeof item.avatarDataUrl === 'string' && item.avatarDataUrl.length <= 2800000 && /^data:image\/(png|jpeg|webp);base64,/.test(item.avatarDataUrl)) brand.avatarDataUrl = item.avatarDataUrl;
        return [brand];
      } catch { return []; }
    });
  } catch { return []; }
}
export function saveCustomBrands(brands: Brand[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(brands)); }
