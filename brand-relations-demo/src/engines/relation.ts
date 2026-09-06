import { RELATION_WEIGHTS } from '../config';
import type { Brand, Dimension, RelationResult, RelationType } from '../domain/types';
import { hash } from '../domain/hash';

type Lexicon = Record<string, readonly string[]>;
const CAPABILITIES: Lexicon = {
  design: ['product design', 'concept development', '产品设计', '概念设计'], manufacturing: ['manufacturing', 'furniture production', '生产制造', '小批量生产', '制造'],
  material: ['material development', 'sustainable materials', 'material research', '材料研发', '可持续材料'],
  prototype: ['prototyping', 'production engineering', '原型制作', '打样'], distribution: ['distribution', 'logistics', '渠道分销', '分销', '物流'],
  visual: ['visual direction', '视觉设计', '视觉表达'], culture: ['cultural storytelling', 'exhibition curation', '文化叙事', '展览策划'],
  craft: ['traditional craft', 'ceramics', '传统工艺', '陶瓷'], technology: ['ai technology', 'software development', 'electronics', '人工智能', '软件开发', '电子技术'],
  experience: ['digital interaction', 'sound design', '数字交互', '体验设计', '声音设计'], space: ['retail space', 'spatial design', '零售空间', '空间设计'],
  content: ['content production', 'publishing', '内容制作', '出版'], community: ['community building', 'event production', '社群运营', '活动策划'],
  food: ['food development', 'tea sourcing', 'coffee roasting', '食品研发', '茶叶', '咖啡烘焙'], packaging: ['packaging', '包装'], textile: ['textile development', '纺织', '面料研发'],
  ip: ['character ip', 'ip licensing', 'brand collaboration', '角色 ip', '角色IP', 'ip 授权', 'IP授权', '商品授权', '品牌联名', '原创动漫'],
  finance: ['tax reporting', 'audit preparation', 'payroll'], compliance: ['compliance training', 'bookkeeping'],
};
const PROJECTS: Lexicon = {
  physical: ['physical products', 'object collections', 'wearable collections', '实体产品', '用品', '收纳', '产品'],
  culture: ['cultural exhibitions', 'cultural projects', '文化展览', '文化项目'], digital: ['digital experiences', '数字体验'],
  retail: ['pop-up retail', '快闪零售', '零售', '门店'], content: ['editorial content', 'campaigns', '内容', '传播活动', '社交媒体', '线上宣发'],
  food: ['food experiences', 'food rituals', '食品体验', '饮食仪式', '主题饮品'], industry: ['industrial procurement', 'freight', '工业采购', '货运'],
  finance: ['tax compliance', 'financial reporting'], outdoors: ['outdoor adventures', 'wilderness'],
};
const AUDIENCES: Lexicon = {
  design: ['designers', 'creative professionals', '设计师', '创意工作者'], maker: ['makers', 'craftspeople', '创客', '手工艺人'],
  collector: ['collectors', '收藏者'], culture: ['culture lovers', 'readers', 'musicians', '文化爱好者', '读者', '音乐人'],
  tech: ['technologists', 'digital creatives', '科技从业者', '数字创作者'], local: ['local communities', 'families', 'students', '本地社群', '家庭', '学生'],
  home: ['home enthusiasts', '家居', '小空间生活'], fashion: ['fashion enthusiasts', '时尚消费者'], retail: ['retailers', '零售商'],
  food: ['food lovers', '食品爱好者'], eco: ['environmentally conscious', 'nature lovers', '环保消费者', '自然爱好者'],
  industry: ['industrial buyers', 'freight operators', 'procurement'],
  finance: ['accountants', 'finance departments'], outdoors: ['hikers', 'outdoor athletes'],
  youth: ['young professionals', 'white-collar', 'college students', '年轻白领', '白领', '大学生', '年轻消费者', '潮玩爱好者', '动漫爱好者'],
};
const ADJACENT = new Set(['design:maker', 'collector:design', 'culture:design', 'design:tech', 'collector:culture', 'culture:tech', 'culture:local', 'food:local', 'design:fashion', 'design:home', 'maker:retail', 'eco:maker', 'eco:fashion', 'eco:outdoors', 'home:retail', 'design:retail', 'culture:youth', 'food:youth', 'local:youth']);
const PROJECT_BRIDGES: Record<string, number> = {
  'culture:physical': 0.58, 'digital:physical': 0.7, 'physical:retail': 0.67,
  'content:physical': 0.48, 'culture:digital': 0.85, 'culture:retail': 0.8,
  'content:culture': 0.75, 'food:retail': 0.85, 'content:digital': 0.75,
  'food:physical': 0.42, 'outdoors:physical': 0.35, 'content:outdoors': 0.4,
};
const LABELS: Record<string, string> = {
  design: '概念与产品设计', manufacturing: '小批量制造',
  material: '材料研发', prototype: '生产知识与原型制作',
  distribution: '渠道分销', visual: '视觉设计', culture: '文化叙事',
  craft: '传统工艺', technology: '技术', experience: '交互体验',
  space: '空间', content: '内容与出版', community: '社群与活动',
  finance: '财税', compliance: '合规', food: '食品专业能力', packaging: '包装', textile: '纺织研发', ip: '角色 IP 与商业授权',
};
const OUTCOMES: Record<string, string> = {
  physical: '实验性的限量器物系列。',
  culture: '连接不同文化实践的参与式展览。',
  digital: '把文化故事转化为数字体验的交互原型。',
  retail: '结合器物、故事与共同受众的小型快闪。',
  content: '面向新受众介绍双方实践的内容系列。',
  food: '具有独特仪式与材料表达的品鉴体验。',
  industry: '生产与分销流程的效率试点。',
  outdoors: '社群发起的小型户外体验。',
  finance: '围绕财务报告流程的专项试点。',
};
const pair = (a: string, b: string) => [a, b].sort().join(':');
const extract = (text: string, lexicon: Lexicon) => Object.keys(lexicon).filter(key => lexicon[key].some(word => text.toLowerCase().includes(word)));
const intersection = (a: string[], b: string[]) => a.filter(item => b.includes(item));
const overlap = (a: string[], b: string[]) => intersection(a, b).length / Math.max(1, new Set([...a, ...b]).size);
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const TRAITS: Lexicon = {
  experimental: ['experimental', '实验性'], playful: ['playful', '趣味', '可爱', '活泼'], curious: ['curious', '好奇'],
  traditional: ['traditional', '传统'], practical: ['practical', '务实'], sustainable: ['sustainable', '可持续'], independent: ['independent', '独立'],
  precise: ['precise', '精确'], warm: ['warm', '温暖'], open: ['open', '开放'], thoughtful: ['thoughtful', '深思熟虑'],
};

/** Pure directional explanation with symmetric scoring. Only reads Brand snapshots. */
export function calculateMockRelation(focus: Brand, target: Brand): RelationResult {
  const a = extract(focus.offers, CAPABILITIES), b = extract(target.offers, CAPABILITIES);
  const aNeeds = extract(focus.needs, CAPABILITIES), bNeeds = extract(target.needs, CAPABILITIES);
  const supplied = intersection(a, bNeeds), received = intersection(b, aNeeds);
  const aGoals = extract(focus.intent, PROJECTS), bGoals = extract(target.intent, PROJECTS);
  const commonGoals = intersection(aGoals, bGoals);
  const bridges = aGoals.flatMap(x => bGoals.map(y => x === y ? 1 : PROJECT_BRIDGES[pair(x, y)] ?? 0));
  const projectAffinity = Math.max(0, ...bridges);
  // Natural fields, not character seed, drive the small deterministic variation.
  const fingerprints = [focus, target].map(brand => [brand.id, brand.offers, brand.needs, brand.intent, brand.identity].join('|')).sort();
  const jitter = hash(fingerprints.join('::')) % 7 - 3;
  const intentFit = clamp(12 + projectAffinity * 81 + jitter);
  const complementarity = clamp(15 + Math.min(supplied.length, 2) * 18 + Math.min(received.length, 2) * 18 + (supplied.length && received.length ? 8 : 0));
  const aAudience = extract(focus.audience, AUDIENCES), bAudience = extract(target.audience, AUDIENCES);
  const audienceSimilarity = overlap(aAudience, bAudience);
  const adjacent = aAudience.some(x => bAudience.some(y => ADJACENT.has(pair(x, y))));
  const audienceExpansion = clamp(audienceSimilarity > 0.8 ? 40 : adjacent ? 84 + jitter : audienceSimilarity > 0 ? 67 : 22);
  const tension = (a.includes('craft') && b.includes('technology')) || (b.includes('craft') && a.includes('technology'));
  const sharedTraits = Object.keys(TRAITS).filter(trait => [focus, target].every(brand => TRAITS[trait].some(term => brand.identity.toLowerCase().includes(term))));
  const chemistry = clamp(tension ? 94 + jitter : sharedTraits.length ? 65 + Math.min(3, sharedTraits.length) * 8 + jitter : 45 + jitter);
  const conflict = [focus, target].some((brand, i, both) => /no prototypes|no limited editions|above 100000/i.test(brand.constraints) && /experimental|limited|prototype/i.test(both[1 - i].intent));
  const feasibility = conflict ? 20 : 91;
  const dimensions = { intentFit, complementarity, audienceExpansion, chemistry, feasibility };
  const collaborationFit = clamp((Object.keys(RELATION_WEIGHTS) as Dimension[]).reduce((sum, key) => sum + dimensions[key] * RELATION_WEIGHTS[key], 0));
  const peer = overlap(a, b) > 0.72 && complementarity < 45;
  const relationType: RelationType = collaborationFit < 50 ? 'Weak Fit'
    : peer ? 'Peer / Same Tribe'
    : tension ? 'Productive Tension'
    : supplied.length > 0 && received.length > 0 ? 'Mutual Complement'
    : [...supplied, ...received].includes('manufacturing') ? 'Production Partner'
    : [...supplied, ...received].includes('distribution') ? 'Distribution Bridge'
    : [...supplied, ...received].includes('technology') ? 'Technology Transfer'
    : supplied.length + received.length > 0 ? 'Capability Complement'
    : a.includes('culture') && b.includes('culture') ? 'Cultural Exchange'
    : audienceExpansion >= 80 ? 'Audience Bridge' : 'Creative Chemistry';
  const describe = (items: string[]) => items.slice(0, 2).map(key => LABELS[key] ?? key).join('与');
  const evidence = [
    supplied.length ? `你可以带来${describe(supplied)}，回应 ${target.name} 的需求。` : '',
    received.length ? `对方可以带来${describe(received)}，支持 ${focus.name} 的需求。` : '',
  ].filter(Boolean).join(' ');
  const reason = peer ? '双方能力与受众较接近，但未填补彼此的主要能力缺口。共同品味还需要转化为具体合作价值。'
    : tension ? `传统工艺与技术形成可探索的差异。 ${evidence} ${projectAffinity >= 0.7 ? '共同的项目方向让这种差异具有合作价值。' : '具体的共同项目仍需明确。'}`
    : `${evidence || '现有资料未显示直接的能力与需求互补。'} ${projectAffinity >= 0.7 ? '双方项目目标有机会支撑共同产物。' : projectAffinity > 0 ? '双方目标相邻，可以先明确一个小型共同任务。' : '双方当前项目目标的方向不同。'}`;
  const goal = commonGoals[0] ?? [...aGoals, ...bGoals].sort()[0];
  const ipFoodCollaboration = [...a, ...b].includes('ip') && [...a, ...b].includes('food') && [...aGoals, ...bGoals].includes('retail');
  return {
    sourceBrandId: focus.id, targetBrandId: target.id,
    collaborationFit, relationType, ...dimensions, reason: !focus.intent.trim() || !target.intent.trim() ? `${evidence || '目前可用于判断的资料较少。'} 联名目标尚待补充，当前只显示已有能力线索。` : reason,
    possibleOutcome: collaborationFit < 50 ? '尚未形成明确的共同项目，投入前需先确认共同目标。' : ipFoodCollaboration ? '一套角色主题饮品、联名杯套与门店打卡内容的限时体验。' : OUTCOMES[goal] ?? '通过小型共同原型验证合作机会。',
    caveat: conflict ? '工业起订量与限量试点存在冲突。'
      : projectAffinity < 0.4 ? '仅凭能力互补无法解决当前目标差异。'
      : !a.includes('distribution') && !b.includes('distribution') && goal === 'physical' ? '渠道分销能力仍待补足。'
      : peer ? '可能需要第三方伙伴补充缺失的能力。' : undefined,
  };
}
