import { extractCapabilities } from '../engines/character';
import type { CapabilityEvidence } from './accessoryRules';
import type { Brand } from './types';
import { INTAKE_FIELDS, emptyIntake, parseBrandIntake } from './brandIntake';
import type { BrandIntake, IntakeKey } from './brandIntake';
import { candidateBrand, createLocalCandidates } from '../engines/characterGenome';

export interface BrandDocument { id: string; name: string; text: string; visualRef?: string }
export interface ProfileEvidence { field: IntakeKey; documentId: string; quote: string }
export interface ProfileGap { field: IntakeKey; material: string; reason: string }
export interface BrandProfile { documents: BrandDocument[]; evidence: ProfileEvidence[]; gaps: ProfileGap[]; source: 'ai' | 'local'; summary: string; accessoryEvidence?: CapabilityEvidence[]; accessoryReview?: 'complete' | 'unavailable'; wearable?: { url: string; source: 'generated' } }
export interface ProfileAnalysis { fields: BrandIntake; profile: BrandProfile }
const suggested: Partial<Record<IntakeKey, string>> = { name: '品牌介绍首页', category: '品牌介绍或业务说明', offers: '产品目录或服务清单', needs: '合作需求简报', intent: '本期联名目标', audience: '用户画像与使用反馈', identity: '品牌视觉或语气规范', constraints: '可投入资源与交付边界', supportingEvidence: '近期项目案例' };
export function fallbackGaps(fields: BrandIntake): ProfileGap[] {
  return INTAKE_FIELDS.filter(field => !fields[field.key].trim()).slice(0, 3).map(field => ({ field: field.key, material: suggested[field.key] || field.label, reason: `帮助判断${field.label}，目前资料中尚未明确。` }));
}
export function validateDocuments(value: unknown): BrandDocument[] {
  if (!Array.isArray(value) || !value.length || value.length > 10) throw new Error('请上传 1–10 份品牌资料。');
  const docs = value.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 220 || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 24000) throw new Error('资料内容无效，请重新上传。');
    if (item.visualRef !== undefined && (typeof item.visualRef !== 'string' || !/^\/api\/collider\/avatar-assets\/[a-f0-9-]{36}\.(png|jpeg|webp)$/.test(item.visualRef))) throw new Error('视觉参考无效，请重新上传。');
    return { id: item.id, name: item.name, text: item.text, ...(item.visualRef ? {visualRef: item.visualRef} : {}) };
  });
  if (new Set(docs.map(item => item.id)).size !== docs.length || docs.reduce((sum, doc) => sum + doc.text.length, 0) > 100000) throw new Error('资料重复或总文字超过 10 万字，请精简后上传。');
  return docs;
}
export function localProfile(documents: BrandDocument[]): ProfileAnalysis {
  const fields = { ...emptyIntake }; const evidence: ProfileEvidence[] = []; const conflicts = new Set<IntakeKey>();
  for (const doc of documents) {
    try {
      const parsed = parseBrandIntake(doc.text);
      // Unstructured prose is evidence, not a declared capability or brand identity.
      for (const field of INTAKE_FIELDS) {
        if (field.key === 'supportingEvidence') continue;
        const value = parsed[field.key];
        if (value && doc.text.includes(value) && !conflicts.has(field.key)) {
          if (fields[field.key] && fields[field.key] !== value) { fields[field.key] = ''; conflicts.add(field.key); continue; }
          fields[field.key] = value;
          evidence.push({ field: field.key, documentId: doc.id, quote: value });
        }
      }
    } catch { /* Keep original document even when it isn't structured brand JSON. */ }
  }
  return { fields, profile: { documents, evidence: evidence.filter(ref => !conflicts.has(ref.field)), gaps: fallbackGaps(fields), source: 'local', summary: '已读取材料；当前仅识别明确标注的字段，语义理解等待 AI 连接。' } };
}
export function validateProfileResult(raw: unknown, documents: BrandDocument[]): ProfileAnalysis {
  if (!raw || typeof raw !== 'object') throw new Error('模型未返回有效的品牌理解。');
  const result = raw as Record<string, unknown>;
  if (!result.fields || typeof result.fields !== 'object' || !Array.isArray(result.evidence) || !Array.isArray(result.gaps) || typeof result.summary !== 'string' || result.summary.length > 600) throw new Error('品牌理解结构不完整。');
  const fields = { ...emptyIntake }; const evidence: ProfileEvidence[] = [];
  for (const field of INTAKE_FIELDS) {
    const value = (result.fields as Record<string, unknown>)[field.key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > field.max) throw new Error('品牌字段格式超出限制。');
    const refs = result.evidence.filter(ref => ref && ref.field === field.key && typeof ref.documentId === 'string' && typeof ref.quote === 'string' && ref.quote.trim().length >= 2 && ref.quote.length <= 3000 && documents.some(doc => doc.id === ref.documentId && doc.text.includes(ref.quote)));
    if (!refs.length) continue; // Unsupported claims remain unknown.
    if (field.key === 'offers' && extractCapabilities(value).some(cap => !refs.some(ref => extractCapabilities(ref.quote).some(source => source.id === cap.id)))) continue;
    fields[field.key] = value.trim();
    evidence.push(...refs.map(ref => ({ field: field.key, documentId: ref.documentId, quote: ref.quote })));
  }
  const gaps: ProfileGap[] = result.gaps.slice(0, 5).flatMap(item => {
    if (!item || !INTAKE_FIELDS.some(field => field.key === item.field) || typeof item.material !== 'string' || !item.material.trim() || item.material.length > 160 || typeof item.reason !== 'string' || item.reason.length > 500) return [];
    return [{ field: item.field, material: item.material, reason: item.reason }];
  });
  return { fields, profile: { documents, evidence, gaps: gaps.length ? gaps : fallbackGaps(fields), source: 'ai', summary: result.summary } };
}
export function brandFromProfile(analysis: ProfileAnalysis, initial?: Brand): Brand {
  const fields = analysis.fields;
  if (!fields.name.trim()) throw new Error('只需确认品牌名称，即可先开始探索。');
  const brand = candidateBrand(fields, createLocalCandidates(fields)[0], initial?.id ?? `company-${crypto.randomUUID()}`);
  return { ...brand, ...fields, ...(initial ? { fictional: initial.fictional, contact: initial.contact, evidence: initial.evidence, visualSeed: initial.visualSeed, avatarDataUrl: initial.id.startsWith('lab-') || (initial.name === fields.name && initial.identity === fields.identity) ? initial.avatarDataUrl : undefined } : {}), summary: initial?.category === fields.category ? initial.summary : fields.category || '品牌资料正在逐步完善。', profile: { ...analysis.profile, accessoryEvidence: analysis.profile.accessoryEvidence?.map(item => ({ ...item, subjectBrandId: item.subjectBrandId === 'current-brand' || item.subjectBrandId === initial?.id ? brand.id : item.subjectBrandId })) } };
}
export function profileCoverage(brand: Brand) {
  const keys = ['category', 'offers', 'needs', 'intent', 'audience', 'identity', 'constraints', 'supportingEvidence'] as const;
  return keys.filter(key => Boolean(brand[key]?.trim())).length / keys.length;
}
