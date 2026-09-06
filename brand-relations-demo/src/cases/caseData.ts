import type { Brand } from '../domain/types';
import { generateMockBrands } from '../data/mockBrands';
import { createLocalCandidates, PARTS } from '../engines/characterGenome';

export interface ExampleBrand extends Brand { execution: string; shortRole: string; avatarNote: string }
export interface Opportunity {
  id: string; title: string; subtitle: string; partnerIds: string[];
  verdict: string; why: string; roles: string[]; diagnostics: [string, string, string]; next: string;
}

function avatar(brand: Brand, index: number): Brand {
  const candidates = createLocalCandidates(brand);
  return { ...brand, character: candidates[index % candidates.length] };
}
const originalMemory = generateMockBrands(1).find(brand => brand.id === 'memory-block')!;
export const memory: ExampleBrand = {
  ...avatar(originalMemory, 1), shortRole: '概念 · 设计 · 原型',
  execution: '原资料未说明可投入工期、预算与量产能力，暂不补成已确认。',
  avatarNote: '头冠对应概念设计和原型能力；需要制造伙伴，不代表自己已经具备制造能力。',
};
const descriptions = [
  { id: 'morrow-materials', name: 'Morrow Materials', category: '再生材料实验室', shortRole: '材料研发 · 样品', offers: '材料研发、可持续材料、原型制作。', needs: '产品设计、生产制造、零售空间。', intent: '寻找能将纸纤维材料做成日常物件的设计伙伴。', audience: '材料爱好者、独立设计师、生活方式买手。', identity: '温润、实验性、重视材料可追溯性。', execution: '虚构设定：可提供 12 块样片与材料测试记录；尚无稳定量产产线。', constraints: '虚构设定：未做食品接触与防水用途验证；不能承诺这些用途。', summary: '把回收纸纤维变成带有颗粒质感的材料，正在寻找第一款日常产品。' },
  { id: 'mold-and-moss', name: 'Mold & Moss', category: '小批量制造工作室', shortRole: '模具 · 小批量制造', offers: '小批量制造、生产制造、打样。', needs: '产品设计、材料研发。', intent: '想与独立设计品牌共同验证一款 30–100 件的小批量物件。', audience: '独立设计品牌、小型买手店。', identity: '精确、务实、愿意反复试做。', execution: '虚构设定：可评估 30 件试产，预计需 4 周；成本与良率需要看样片。', constraints: '虚构设定：须先测试材料再确认报价，暂不承担电子组装。', summary: '专注模具和小批量工艺，擅长把一件样品变成一小批可交付的产品。' },
  { id: 'second-room', name: 'Second Room', category: '社区空间与小型零售', shortRole: '空间 · 社群', offers: '零售空间、社群运营、活动策划。', needs: '产品设计、文化叙事、内容制作。', intent: '寻找能在社区空间里发生的三天小展览与可带走的物件。', audience: '附近居民、年轻创作者、周末访客。', identity: '友善、轻松、重视人与人的交流。', execution: '虚构设定：有 60 平方米场地、两位活动人员；档期尚需协商。', constraints: '虚构设定：同时接待不超过 25 人，不接受高噪声装置。', summary: '一个把小展览、社区活动和独立物件放在一起的街角空间。' },
  { id: 'soft-signal', name: 'Soft Signal', category: '数字交互工作室', shortRole: '交互 · 声音', offers: '数字交互、软件开发、声音设计。', needs: '产品设计、零售空间、文化叙事。', intent: '想让数字交互进入一场小规模的实体体验。', audience: '展览观众、互动艺术爱好者。', identity: '敏感、好奇、表达克制。', execution: '虚构设定：可以做浏览器交互原型，提供两天现场调试；长期维护需另议。', constraints: '虚构设定：不提供专用硬件量产；录音或个人信息收集需要明确参与方式。', summary: '为实体空间编写轻量交互，让物件、声音与人的动作产生回应。' },
  { id: 'fable-archive', name: 'Fable Archive', category: '地方故事与内容工作室', shortRole: '故事 · 内容', offers: '文化叙事、内容制作、展览策划。', needs: '产品设计、数字交互、零售空间。', intent: '寻找把原创地方故事变成实体体验的合作伙伴。', audience: '城市文化爱好者、展览观众、独立出版读者。', identity: '细腻、温和、重视故事出处。', execution: '虚构设定：可提供三篇原创故事和编辑支持；最终使用范围需书面确认。', constraints: '虚构设定：第三方照片与受访者资料不默认包含在授权中。', summary: '收集城市里容易被忽略的生活片段，用原创文字与声音讲述。' },
  { id: 'heavy-form', name: 'Heavy Form', category: '规模化制造企业', shortRole: '标准化制造', offers: '生产制造、物流、包装。', needs: '产品设计、渠道分销。', intent: '寻找能形成长期、万件级标准订单的产品合作。', audience: '连锁零售采购、大型产品品牌。', identity: '稳定、效率优先、强调标准流程。', execution: '虚构设定：适合标准产品的大批量生产，起订量为 10,000 件。', constraints: '虚构设定：不接 30 件订单，不提供独立打样服务。', summary: '能把成熟产品稳定地大规模交付，但不适合从零开始的小样品试验。' },
];
export const partners: ExampleBrand[] = descriptions.map((item, index) => {
  const brand = avatar({ ...item, characterSeed: 601 + index }, index);
  const emphasized = brand.character!.parts.filter(part => part.emphasis > 0).map(part => PARTS.find(p => p.id === part.id)!.label);
  return { ...brand, execution: item.execution, shortRole: item.shortRole, avatarNote: `${emphasized.join('、')}根据已有能力突出；造型与颜色不代表品牌实力或适配分。` };
});
export const allBrands = [memory, ...partners];
export const byId = new Map(allBrands.map(brand => [brand.id, brand]));
export const referenceCases: Opportunity[] = [
  { id: 'paper-study', title: '纸纤维的第一件日常物', subtitle: '材料样片 → 形态探索 → 使用测试', partnerIds: ['morrow-materials'], verdict: '值得验证', why: 'Memory Block 有概念设计和原型能力，Morrow 有材料样片，双方可以先一起探索材料适合成为哪种日常物件。', roles: ['Memory Block：设计三种托盘形态并制作原型。', 'Morrow Materials：提供样片与已知材料特性。'], diagnostics: ['假设设计爱好者愿意为触感与材料故事买单；目前没有购买证据，先看实物和支付意愿。', '你获得材料实验机会，对方获得产品应用反馈；样片与设计投入尚未协商。', '本次只做原型。谁负责稳定制造仍未知；暂不宣传防水或食品接触用途。'], next: '先索取材料样片，邀请 5 位目标使用者比较形态和触感。人数是本次示例设定。' },
  { id: 'thirty-objects', title: '30 件，再生纸桌面托盘', subtitle: '设计 × 材料 × 小批量工艺', partnerIds: ['morrow-materials', 'mold-and-moss'], verdict: '有试产路径', why: '在设计与材料之外加入小批量制造，补上从一件原型到一批物件的环节。三方贡献有区别，但试产仍需先验证材料与成本。', roles: ['Memory Block：形态设计、原型与视觉表达。', 'Morrow Materials：材料样片与配方说明。', 'Mold & Moss：工艺测试、模具评估与试产报价。'], diagnostics: ['面向桌面物件爱好者。30 件是试产假设，不是已有订单；需要样品反馈或预订验证。', '三方分别获得设计作品、材料应用与制造订单的可能性；报价、分成和试验损耗均待确认。', '制造方先评估材料和良率，再确认 4 周是否足够；双方品牌批准不能代替第三方确认。'], next: '把样片和一版结构草图交给制造方，先取得工艺反馈与成本区间。' },
  { id: 'memory-room', title: '一间会回应你的记忆展', subtitle: '物件 × 故事 × 交互 × 社区空间', partnerIds: ['fable-archive', 'soft-signal', 'second-room'], verdict: '先确认体验范围', why: 'Memory Block 把故事变成可触摸的物件，Fable 提供原创叙事，Soft Signal 让动作触发声音，Second Room 提供场地与社区触点。', roles: ['Memory Block：三件触摸物件与空间视觉。', 'Fable Archive：三篇原创故事与文本编辑。', 'Soft Signal：轻量交互原型与现场调试。', 'Second Room：场地、预约与现场接待。'], diagnostics: ['假设附近居民愿意体验城市故事。先用一件物件测试是否听得懂、愿意停留；不把场地客流当需求。', '以三天小展作为讨论起点，各方可能获得作品、传播或场地活动价值；预算与收益口径尚未确认。', '先确认故事许可、场地档期和预约容量；默认不录制访客声音，维护范围也需约定。'], next: '先做一个不收集访客资料的交互样机，四方一起看体验，再讨论三天活动。' },
  { id: 'scale-mismatch', title: '能生产，但这次规模不合适', subtitle: '限定物件 × 万件级制造', partnerIds: ['heavy-form'], verdict: '需要调整方案', why: '制造能力确实补充设计能力，但 Memory Block 的限定物件方向与 Heavy Form 的万件级起订要求存在明确规模冲突。能力标签相合不能抹掉这个条件。', roles: ['Memory Block：希望探索限定物件。', 'Heavy Form：只承接成熟产品的万件级订单。'], diagnostics: ['没有证据支持一万件的市场需求，不能为了满足工厂起订量扩大试验。', '大批量可能适合工厂，却把库存与资金压力交给设计方；不应把它写成双赢。', '本样例明确不接受 30 件和独立打样，当前试产方案无法直接落地。'], next: '优先寻找小批量制造方；只有需求与资金条件改变时，再讨论规模化版本。' },
];

export function makeRandomOpportunity(ids: string[]): Opportunity {
  const exact = referenceCases.find(c => [...c.partnerIds].sort().join() === [...ids].sort().join());
  if (exact) return { ...exact, id: `random-${ids.join('-')}` };
  const members = ids.map(id => byId.get(id)!);
  const hasScale = ids.includes('heavy-form');
  return {
    id: `random-${ids.join('-')}`, partnerIds: ids,
    title: hasScale ? '这次相遇，需要重新定义规模' : '从一件物件开始找共同题目',
    subtitle: '随机相遇 · 以下为待讨论的示例假设',
    verdict: hasScale ? '先处理规模冲突' : '共同方向尚待确认',
    why: `Memory Block 可以带来概念、设计和原型。抽到的伙伴分别提供${members.map(b => b.shortRole).join('、')}。这是随机组成的候选，并不表示每一位都已找到必要角色。`,
    roles: ['Memory Block：提供概念设计和原型探索。', ...members.map(b => `${b.name}：可能贡献${b.shortRole}；实际投入待本人确认。`)],
    diagnostics: ['先提出一个使用场景，再确认这些能力是否解决同一个消费者问题。目前没有需求证据。', '每个成员都需要说明希望得到什么。没有独立贡献的成员可以不加入；预算与收益未确认。', hasScale ? 'Heavy Form 的 10,000 件起订量与小规模探索冲突，不能直接把它作为样品制造方。' : '查看每个品牌的执行与限制，先找出许可、生产或场地中最关键的缺口。'],
    next: hasScale ? '保持小规模目标，讨论是否更换制造方；不要为了组合而扩大生产。' : '先写出一个共同产物和逐方角色；如果无法说明每一方的作用，就调整组合。',
  };
}

export function drawExampleDeck(partnerCount: number, rng: () => number = Math.random): Opportunity[] {
  if (![1, 2, 3].includes(partnerCount)) throw new Error('请选择 1–3 个伙伴');
  const pool = partners.map(b => b.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(.999999999, rng())) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: Math.min(3, Math.floor(pool.length / partnerCount)) }, (_, i) => makeRandomOpportunity(pool.slice(i * partnerCount, (i + 1) * partnerCount)));
}
