import { INTAKE_FIELDS, intakeFromBrand, type IntakeKey } from '../domain/brandIntake';
import type { BrandDocument, ProfileEvidence } from '../domain/brandProfile';
import type { Brand } from '../domain/types';

/** Prepared source snapshots let the demo proceed without waiting for an AI request. */
export function withDemoMaterials(brand: Brand): Brand {
  const fields = intakeFromBrand(brand);
  const groups: { name: string; keys: IntakeKey[] }[] = [
    { name: '品牌介绍与定位', keys: ['name', 'category'] },
    { name: '产品与可提供资源', keys: ['offers'] },
    { name: '目标受众与消费场景', keys: ['audience'] },
    { name: '品牌视觉与表达规范', keys: ['identity'] },
    { name: '本期合作目标与伙伴需求', keys: ['intent', 'needs'] },
    { name: '授权审批与交付边界', keys: ['constraints'] },
    { name: '资料来源与事实说明', keys: ['supportingEvidence'] },
  ];
  const evidence: ProfileEvidence[] = [];
  const documents: BrandDocument[] = groups.map((group, index) => {
    const id = `demo-${brand.id}-${index + 1}`;
    for (const field of group.keys) {
      if (fields[field]) evidence.push({ field, documentId: id, quote: fields[field] });
    }
    return {
      id,
      name: `${String(index + 1).padStart(2, '0')}_${brand.name}_${group.name}.md`,
      text: `# ${brand.name} · ${group.name}\n\n演示资料包：公开品牌快照与本地合作设想，非品牌方提交的官方文件。\n\n${group.keys.map(key => `${INTAKE_FIELDS.find(field => field.key === key)!.label}：${fields[key]}`).join('\n\n')}`,
    };
  });
  documents.push({
    id: `demo-${brand.id}-8`,
    name: `08_${brand.name}_渠道预演与商务入口.md`,
    text: `# ${brand.name} · 一对一渠道预演简报\n\n以下为演示合作设想，尚未获得双方授权。\n\n目标：通过一次一对一品牌合作，增加双方在对方受众中的曝光与认知。\n视觉原则：双方各自保留完整品牌 VI，在各自渠道沿用自己的主色、标识和语气，以合作署名与联名内容引入伙伴，不创建第三套品牌形象。\n预演内容：双方各一张渠道主视觉、各一段发布文案，以及各自负责的渠道触点与审批项。\n评估方式：讨论触达、互动与后续访问的观察口径；不预填未经验证的粉丝量、销量或曝光承诺。\n执行边界：申请建联后可以先做内部预演，发布、授权范围、预算与档期由双方确认。\n\n公开商务入口：${brand.contact?.label ?? '待确认'}\n官网：${brand.contact?.website ?? '待补充'}\n邮箱：${brand.contact?.email ?? '待补充'}\n说明：${brand.contact?.note ?? '实际合作需由品牌方确认。'}`,
  });
  return {
    ...brand,
    profile: {
      documents,
      evidence,
      gaps: [],
      source: 'local',
      summary: '已预置 8 份演示资料，覆盖品牌定位、产品资源、受众、VI、合作目标、交付边界与渠道预演，可直接进入下一步。',
    },
  };
}
