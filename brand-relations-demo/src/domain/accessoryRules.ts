import type { Brand } from './types';
import { CAPABILITY_CATALOG, extractCapabilities } from '../engines/character';
import type { CapabilityId } from '../engines/character';

/** Presentation only. These gates never alter Relation scores or weights. */
export const ACCESSORY_FAMILIES = [
  { id: 'creative', label: '创意设计', capabilities: ['design', 'packaging'], prop: '设计板' },
  { id: 'making', label: '制作交付', capabilities: ['manufacturing', 'craft', 'prototype', 'food'], prop: '工具包' },
  { id: 'materials', label: '材料开发', capabilities: ['materials', 'textiles'], prop: '材料色样扇' },
  { id: 'technology', label: '科技交互', capabilities: ['technology', 'digital'], prop: '交互终端' },
  { id: 'distribution', label: '渠道触达', capabilities: ['distribution'], prop: '配送箱' },
  { id: 'gathering', label: '空间社群', capabilities: ['space', 'community', 'events'], prop: '活动旗' },
  { id: 'story', label: '内容叙事', capabilities: ['culture', 'content', 'sound'], prop: '故事板' },
  { id: 'operations', label: '专业运营', capabilities: ['finance'], prop: '工作夹' },
] as const;

export type AccessoryFamilyId = typeof ACCESSORY_FAMILIES[number]['id'];
export interface CapabilityEvidence {
  capabilityId: CapabilityId;
  claimType: 'owned' | 'wanted' | 'planned' | 'historical';
  subjectBrandId: string;
  documentId: string;
  quote: string;
  project?: string;
  deliverable?: string;
  scope?: string;
  limits?: string;
  responsible?: string;
  currentAsOf?: string;
  conflict?: boolean;
}
export interface AccessoryEntry {
  id: AccessoryFamilyId;
  label: string;
  prop: string;
  capabilityId?: CapabilityId;
  level: 0 | 1 | 2 | 3;
  pending: boolean;
  statusLabel: string;
  reason: string;
}
export interface AccessoryPlan {
  entries: AccessoryEntry[];
  primary?: AccessoryEntry;
  secondary?: AccessoryEntry;
  /** Counts answered gates for declared families, not a brand strength score. */
  coverage: { answered: number; total: number; declared: number; caseSupported: number; deliverySpecified: number };
}

const thirdParty = /合作方|合作伙伴|第三方|供应商|由他人|\b(?:partner|supplier|third[ -]party|outsourced)\b/iu;
const instruction = /忽略.{0,12}(?:规则|指令|提示)|(?:给|授予).{0,16}(?:最高等级|最高级|认证|装备)|\bignore\b.{0,30}\b(?:instructions|rules|prompt)\b/iu;
const adverse = /未完成|未交付|不能|无法|不支持|不承担|停用|停产|已关闭|已经关闭|失败|仅计划|预计|\b(?:failed|discontinued|closed|unavailable|might|may|will|would|expect|expected)\b/iu;
const completed = /已完成|已交付|已生产|已上线|已落地|已售出|\b(?:completed|delivered|launched|produced|shipped)\b/iu;
const statusLabels = ['待了解', '品牌自述', '案例材料支持', '交付条件明确'] as const;

function validSource(brand: Brand, item: CapabilityEvidence): boolean {
  return item.subjectBrandId === brand.id && typeof item.quote === 'string' && item.quote.trim().length >= 2
    && !!brand.profile?.documents.some(doc => doc.id === item.documentId && doc.text.includes(item.quote));
}
function supportsCapability(item: CapabilityEvidence): boolean {
  return !thirdParty.test(item.quote) && !adverse.test(item.quote) && !instruction.test(item.quote)
    && extractCapabilities(item.quote).some(capability => capability.id === item.capabilityId);
}
function grounded(value: string | undefined, quote: string): boolean {
  return typeof value === 'string' && value.trim().length >= 2 && quote.includes(value.trim());
}
function isoDay(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const day = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === value ? day : undefined;
}
function fresh(item: CapabilityEvidence, asOf: string): boolean {
  const current = isoDay(item.currentAsOf); const today = isoDay(asOf);
  return current !== undefined && today !== undefined && item.quote.includes(item.currentAsOf!)
    && current <= today && today - current <= 365 * 86400000;
}

export function deriveAccessoryPlan(brand: Brand, evidence?: CapabilityEvidence[], asOf = new Date().toISOString().slice(0, 10)): AccessoryPlan {
  const checked = (Array.isArray(evidence) ? evidence : []).filter(item => item && typeof item === 'object' && validSource(brand, item));
  // Exact duplicate evidence never adds strength. Multiple records are evaluated independently.
  const records = [...new Map(checked.map(item => [JSON.stringify(item), item])).values()];
  const declared = evidence === undefined ? extractCapabilities(brand.offers).filter(cap => !thirdParty.test(cap.evidence) && !adverse.test(cap.evidence) && !instruction.test(cap.evidence)) : [];
  const entries: AccessoryEntry[] = ACCESSORY_FAMILIES.map(family => {
    const assessments = family.capabilities.map(capabilityId => {
      const matching = records.filter(item => item.capabilityId === capabilityId);
      const conflict = matching.some(item => item.conflict === true);
      const positive = matching.filter(item => (item.claimType === 'owned' || item.claimType === 'historical') && supportsCapability(item));
      let level: AccessoryEntry['level'] = declared.some(cap => cap.id === capabilityId) || positive.length ? 1 : 0;
      let historical = false;
      for (const item of positive) {
        const hasCase = completed.test(item.quote) && grounded(item.project, item.quote) && grounded(item.deliverable, item.quote);
        const hasDelivery = hasCase && item.claimType === 'owned' && grounded(item.scope, item.quote)
          && grounded(item.limits, item.quote) && grounded(item.responsible, item.quote) && fresh(item, asOf);
        const itemLevel = hasDelivery ? 3 : hasCase ? 2 : 1;
        if (itemLevel > level) { level = itemLevel; historical = item.claimType === 'historical'; }
        else if (itemLevel === level && item.claimType === 'owned') historical = false;
      }
      if (conflict && level > 1) level = 1;
      const pending = conflict || level < 3;
      const reason = conflict ? '这项能力存在材料冲突，暂停升级；请确认当前情况。'
        : level === 3 ? '案例及当前范围、限制、负责角色均有材料依据；并非平台认证。'
        : level === 2 ? historical ? '历史案例有材料支持，当前可提供范围仍待补充。' : '案例有材料支持；请补充当前范围、限制、负责角色和日期。'
        : level === 1 ? '明确声明了已有能力，尚需具体案例与交付条件支持。'
        : '尚无本品牌已有能力的有效依据，可先探索伙伴。';
      return { capabilityId, level, pending, reason };
    });
    // Stable catalog order resolves ties, never file count or keyword frequency.
    const best = assessments.sort((a, b) => b.level - a.level)[0];
    return { id: family.id, label: family.label, prop: family.prop, ...best,
      capabilityId: best.level > 0 ? best.capabilityId : undefined, statusLabel: statusLabels[best.level] };
  });
  const visible = entries.filter(entry => entry.level > 0).sort((a, b) => b.level - a.level);
  const coverage = {
    declared: visible.length,
    caseSupported: visible.filter(entry => entry.level >= 2).length,
    deliverySpecified: visible.filter(entry => entry.level >= 3).length,
    answered: visible.reduce((sum, entry) => sum + entry.level, 0),
    total: visible.length * 3,
  };
  return { entries, primary: visible[0], secondary: visible[1], coverage };
}

// Compile-time guard: every mapped ID is part of the existing presentation vocabulary.
const capabilityIds: ReadonlySet<string> = new Set(CAPABILITY_CATALOG.map(item => item.id));
if (ACCESSORY_FAMILIES.some(family => family.capabilities.some(id => !capabilityIds.has(id)))) throw new Error('Unknown accessory capability.');
