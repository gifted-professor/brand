import type { Brand } from './types';
import { candidateBrand, createLocalCandidates, validateBrief } from '../engines/characterGenome';

export const INTAKE_FIELDS = [
  { key: 'name', label: '品牌名称', required: true, placeholder: '例如：苔屿 Moss Isle', max: 80 },
  { key: 'category', label: '品牌定位', required: true, placeholder: '你们是谁，提供什么产品或服务？', max: 3000 },
  { key: 'offers', label: '已有产品、能力与资源', required: true, placeholder: '具体产品、生产能力、渠道、空间或社群；至少 8 个字', max: 3000 },
  { key: 'needs', label: '希望伙伴带来什么', required: false, placeholder: '缺少哪些资源，希望对方负责什么？', max: 3000 },
  { key: 'intent', label: '这次联名的目标', required: false, placeholder: '希望一起做什么，为消费者带来什么？', max: 3000 },
  { key: 'audience', label: '目标消费者与使用场景', required: false, placeholder: '谁会需要？在什么场景下使用或购买？', max: 3000 },
  { key: 'identity', label: '品牌气质与视觉偏好', required: false, placeholder: '关键词、语气、偏好色彩，以及不希望出现的表达', max: 3000 },
  { key: 'constraints', label: '预算、时间与交付边界', required: false, placeholder: '预算范围、时间、数量、地区、许可、审批与负责角色；未知可留空', max: 3000 },
  { key: 'supportingEvidence', label: '案例与依据', required: false, placeholder: '产品链接、以往合作、消费者反馈；请区分已验证事实与设想', max: 8000 },
] as const;
export type IntakeKey = typeof INTAKE_FIELDS[number]['key'];
export type BrandIntake = Record<IntakeKey, string>;
export const emptyIntake: BrandIntake = { name: '', category: '', offers: '', needs: '', intent: '', audience: '', identity: '', constraints: '', supportingEvidence: '' };
export const exampleIntake: BrandIntake = { name: '苔屿 Moss Isle', category: '可持续材料与生活用品工作室', offers: '提供产品设计、材料研发、原型制作及小批量生产。', needs: '希望获得零售空间、社群运营和渠道分销支持。', intent: '试做一组日常收纳用品，先小批量验证再决定量产。', audience: '小空间生活的年轻用户，在家居收纳和礼品场景下使用。', identity: '自然、温暖、克制；苔绿与陶土色。', constraints: '先讨论试验预算与交付时间，许可和维护责任待双方确认。', supportingEvidence: '虚构示例，尚无消费者验证。' };

export function parseBrandIntake(text: string): Partial<BrandIntake> {
  let raw: Record<string, unknown> = {};
  if (text.trimStart().startsWith('{')) {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请上传品牌资料对象。');
    raw = value as Record<string, unknown>;
  } else {
    let active: IntakeKey | undefined;
    for (const line of text.split(/\r?\n/)) {
      const clean = line.replace(/^#{1,6}\s*/, '').trim()
        .replace(/^联名目标(?=[:：])/, '这次联名的目标')
        .replace(/^已有能力(?=[:：])/, '已有产品、能力与资源')
        .replace(/^目标消费者(?=[:：])/, '目标消费者与使用场景');
      const field = INTAKE_FIELDS.find(item => clean === item.label || clean === item.key || clean.startsWith(`${item.label}：`) || clean.startsWith(`${item.label}:`) || clean.startsWith(`${item.key}:`));
      if (field) { active = field.key; raw[active] = clean.replace(new RegExp(`^(?:${field.label}|${field.key})[:：]?`), '').trim(); }
      else if (active) raw[active] = `${raw[active]}\n${line}`.trim();
    }
    if (!Object.keys(raw).length) raw = { supportingEvidence: text.trim() };
  }
  const result: Partial<BrandIntake> = {};
  for (const field of INTAKE_FIELDS) {
    const value = raw[field.key] ?? raw[field.label];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > field.max) throw new Error(`${field.label}格式不正确或超出 ${field.max} 字限制。`);
    result[field.key] = value.trim();
  }
  if (!Object.keys(result).length) throw new Error('未找到品牌字段，请使用资料模板。');
  return result;
}

export function brandFromIntake(input: BrandIntake): Brand {
  for (const field of INTAKE_FIELDS) {
    if ((field.required && !input[field.key].trim()) || input[field.key].length > field.max) throw new Error(`请检查${field.label}。`);
  }
  const brief = validateBrief(input);
  // Freeze the existing recipe and automatically select one result; no new avatar model.
  const brand = candidateBrand(brief, createLocalCandidates(brief)[0], `company-${crypto.randomUUID()}`);
  return { ...brand, intent: input.intent.trim(), audience: input.audience.trim(), constraints: input.constraints.trim(), supportingEvidence: input.supportingEvidence.trim() };
}

export const MATCHING_FIELDS = ['offers', 'needs', 'intent', 'audience', 'identity', 'constraints'] as const;
export function missingMatchingFields(brand: Brand) {
  return INTAKE_FIELDS.filter(field => MATCHING_FIELDS.some(key => key === field.key) && !(brand[field.key] ?? '').trim());
}
export function intakeFromBrand(brand: Brand): BrandIntake {
  return Object.fromEntries(INTAKE_FIELDS.map(field => [field.key, brand[field.key] ?? ''])) as BrandIntake;
}
