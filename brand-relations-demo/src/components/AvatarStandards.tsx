import type { Brand } from '../domain/types';
import { ACCESSORY_FAMILIES } from '../domain/accessoryRules';
import type { AccessoryFamilyId, CapabilityEvidence } from '../domain/accessoryRules';
import App from '../App';

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
export function standardExample(familyId: AccessoryFamilyId, stage: number): Brand {
  const family = ACCESSORY_FAMILIES.find(item => item.id === familyId)!;
  const sample = samples[familyId];
  const id = `rule-example-${family.id}`;
  const quote = `${sample.name}提供${sample.offer}。${stage >= 2 ? `已完成${sample.project}，已交付${sample.deliverable}。` : ''}${stage >= 3 ? '当前服务范围为小批试点；限制为每期两个项目；负责人为项目经理。当前能力确认日期2026-09-06。' : ''}`;
  const evidence: CapabilityEvidence = { capabilityId: familyId === 'gathering' ? 'community' : familyId === 'story' ? 'content' : family.capabilities[0], claimType: 'owned', subjectBrandId: id, documentId: 'demo-document', quote, ...(stage >= 2 ? { project: sample.project, deliverable: sample.deliverable } : {}), ...(stage >= 3 ? { scope: '小批试点', limits: '每期两个项目', responsible: '项目经理', currentAsOf: '2026-09-06' } : {}) };
  return { id, name: sample.name, category: family.label, offers: stage ? sample.offer : '', needs: '', intent: '', audience: '', identity: '', constraints: '', summary: '虚构资料，仅用于规则演示。', characterSeed: 1, profile: { documents: [{ id: 'demo-document', name: `${sample.name}—模拟材料.txt`, text: stage ? quote : sample.name }], evidence: [], gaps: [], source: 'local', summary: '固定测试案例，不是实时模型生成。', accessoryEvidence: stage ? [evidence] : [] } };
}
export default function AvatarStandards() { return <App initialPage="intake" />; }
