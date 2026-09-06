import { useState } from 'react';
import type { Brand } from '../domain/types';
import { ACCESSORY_FAMILIES, deriveAccessoryPlan } from '../domain/accessoryRules';
import type { AccessoryFamilyId, CapabilityEvidence } from '../domain/accessoryRules';
import { AccessoryCharacter } from './AccessoryCharacter';

const samples: Record<AccessoryFamilyId, { name: string; offer: string; project: string; deliverable: string }> = {
  creative: { name: '雾页设计', offer: '产品设计', project: '晨光包装项目', deliverable: '包装设计稿' },
  making: { name: '小批工坊', offer: '生产制造', project: '桌面器物项目', deliverable: '器物样品' },
  materials: { name: '织回材料', offer: '材料研发', project: '再生材料项目', deliverable: '材料样卡' },
  technology: { name: '点阵实验室', offer: '软件开发', project: '门店互动项目', deliverable: '互动程序' },
  distribution: { name: '途间物流', offer: '物流', project: '礼盒配送项目', deliverable: '配送服务' },
  gathering: { name: '晚场街区', offer: '社群运营', project: '周末街区项目', deliverable: '社群活动' },
  story: { name: '慢页影像', offer: '内容制作', project: '品牌故事项目', deliverable: '短片作品' },
  operations: { name: '清账工作室', offer: '税务申报', project: '申报支持项目', deliverable: '申报资料' },
};
const stages = ['只有品牌名', '上传能力介绍', '补充交付案例', '说明本期条件'];
export function standardExample(familyId: AccessoryFamilyId, stage: number): Brand {
  const family = ACCESSORY_FAMILIES.find(item => item.id === familyId)!;
  const sample = samples[familyId];
  const id = `rule-example-${family.id}`;
  const quote = `${sample.name}提供${sample.offer}。${stage >= 2 ? `已完成${sample.project}，已交付${sample.deliverable}。` : ''}${stage >= 3 ? '当前服务范围为小批试点；限制为每期两个项目；负责人为项目经理。当前能力确认日期2026-09-06。' : ''}`;
  const evidence: CapabilityEvidence = { capabilityId: familyId === 'gathering' ? 'community' : familyId === 'story' ? 'content' : family.capabilities[0], claimType: 'owned', subjectBrandId: id, documentId: 'demo-document', quote, ...(stage >= 2 ? { project: sample.project, deliverable: sample.deliverable } : {}), ...(stage >= 3 ? { scope: '小批试点', limits: '每期两个项目', responsible: '项目经理', currentAsOf: '2026-09-06' } : {}) };
  return { id, name: sample.name, category: family.label, offers: stage ? sample.offer : '', needs: '', intent: '', audience: '', identity: '', constraints: '', summary: '虚构资料，仅用于规则演示。', characterSeed: 1, profile: { documents: [{ id: 'demo-document', name: `${sample.name}—模拟材料.txt`, text: stage ? quote : sample.name }], evidence: [], gaps: [], source: 'local', summary: '固定测试案例，不是实时模型生成。', accessoryEvidence: stage ? [evidence] : [] } };
}
export default function AvatarStandards() {
  const [family, setFamily] = useState<AccessoryFamilyId>('creative');
  const [stage, setStage] = useState(1);
  const brand = standardExample(family,stage);
  const plan = deriveAccessoryPlan(brand,brand.profile?.accessoryEvidence,'2026-09-06');
  return <div className="flow-shell avatar-standards">
    <header className="flow-header"><a href="/" className="brand-lockup flow-logo"><img src="/vi/mark-black.svg" alt=""/><span>Brand Relations</span></a><span className="entry-header-note">角色规则 / V1</span></header>
    <main><div className="standards-heading"><p>一个固定角色 · 不同的能力装备</p><h1>让能力，变得看得见。</h1><p>配饰表达已有能力及其材料依据。人物外貌、品牌实力和合作评分，分别处理。</p></div>
      <div className="standards-layout"><section className="standards-portrait"><AccessoryCharacter brand={brand} labelled asOf="2026-09-06"/><h2>{brand.name}</h2><p>{plan.primary ? `${plan.primary.prop} · ${plan.primary.statusLabel}` : '完整基础角色 · 能力待了解'}</p><small>虚构样例 · 规则演示 · 不是平台认证</small></section>
      <section className="standards-controls"><h2>01 / 选择一种能力</h2><div className="family-options">{ACCESSORY_FAMILIES.map(item=><button key={item.id} aria-pressed={family===item.id} onClick={()=>setFamily(item.id)}>{item.label}<small>{item.prop}</small></button>)}</div>
        <h2>02 / 逐步补充有效材料</h2><div className="stage-options">{stages.map((label,index)=><button key={label} aria-pressed={stage===index} onClick={()=>setStage(index)}><span>0{index}</span>{label}</button>)}</div>
        <div className="rule-verdict" role="status"><strong>{plan.primary?.statusLabel || '先保留可能性'}</strong><p>{plan.primary?.reason || '没有已有能力依据，先显示完整基础角色。不虚构装备，仍然可以探索伙伴。'}</p></div>
        <details className="standard-evidence"><summary>查看这次判断的材料依据</summary><p>{brand.profile?.documents[0].text}</p><small>档位由规则程序裁定，不由模型直接打分。样例日期固定为 2026-09-06。</small></details>
      </section></div>
      <section className="standards-principles"><article><strong>1 主 + 1 次</strong><p>主配饰最高约人物高度的三分之一，其余能力放入详情，避免人物变成装备架。</p></article><article><strong>补依据，不刷数量</strong><p>同一介绍上传十次不会升级。案例必须明确主体、完成行为和具体产物。</p></article><article><strong>有争议，就待澄清</strong><p>需求、计划与合作方能力不算自己拥有。新材料出现冲突时暂停相关升级。</p></article></section>
      <section className="standards-pipeline"><h2>智能判断如何分工</h2><p>资料理解 → 能力证据 Agent → 独立红队 Agent → 确定规则裁决 → 配饰装配</p><p>模型提出有来源的事实，并相互检查；最终门槛由代码执行。当前环境未配置模型，这个页面使用固定虚构材料演示。</p></section>
    </main>
  </div>;
}
