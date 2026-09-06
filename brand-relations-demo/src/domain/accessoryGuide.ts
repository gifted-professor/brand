import { RELATION_WEIGHTS } from '../config';
import { PROP_CATALOG, type PropId } from './brandAppearance';
import type { Dimension } from './types';

type CapabilityGuide = { capability: string; evidence: string; metric: string };
// Icons identify a declared product/capability. A source statement is not verification.
export const ACCESSORY_GUIDE: Record<PropId, CapabilityGuide> = {
  tea: { capability:'茶产品与茶事体验', evidence:'产品清单、可供批次、茶事案例', metric:'可供数量 / 需求数量；场次承载人数' },
  coffee: { capability:'咖啡产品与咖啡体验', evidence:'烘焙批次、供货记录、活动方案', metric:'每周可供 kg；每小时出杯数；活动到场率' },
  vase: { capability:'陶艺设计与制作', evidence:'实物样品、工艺说明、交付记录', metric:'合格率；起订量；打样和交付天数' },
  camera: { capability:'影像拍摄与内容制作', evidence:'署名作品、制作分工、可用档期', metric:'约定周期可交付条数；验收通过率' },
  headphones: { capability:'声音设计与后期制作', evidence:'声音作品、制作说明、素材使用范围', metric:'可交付音频分钟数；格式与场景覆盖率' },
  recorder: { capability:'录音采集与声音记录', evidence:'采集样例、设备与人员、可用档期', metric:'采集时长；有效录音比例；场景覆盖数' },
  yarn: { capability:'纺织与针织开发', evidence:'样布、成分与工艺、可投入产能', metric:'可供米数 / 需求米数；色牢度等约定指标' },
  swatches: { capability:'材料研究与样品开发', evidence:'材料样本、测试条件、适用范围', metric:'满足项目指标的样品比例；试验和放大周期' },
  book: { capability:'出版或文化内容', evidence:'目录、内容样章、出版或使用权限', metric:'可用内容量；约定渠道实际触达；交稿周期' },
  tablet: { capability:'数字交互与软件体验', evidence:'可运行演示、功能范围、维护责任', metric:'关键任务完成率；响应时间；承载人数' },
  chip: { capability:'AI 或电子技术模块', evidence:'可运行模块、评测集、接口与部署边界', metric:'目标任务达标率；延迟；单位调用成本' },
  parcel: { capability:'包装设计与供应', evidence:'包装样品、结构测试、报价与产能', metric:'单件成本；破损率；打样天数；供货量' },
  crate: { capability:'物流、仓储或渠道', evidence:'服务区域、渠道约定、历史履约记录', metric:'准时率；破损率；可覆盖网点 / 目标网点' },
  plant: { capability:'园艺产品与种植体验', evidence:'品种清单、养护方法、种植案例', metric:'成活率；可供盆数；养护响应时间' },
  watering: { capability:'园艺工具或养护服务', evidence:'工具样品或养护范围与排期', metric:'可服务点位数；养护频率；问题解决时长' },
  bread: { capability:'烘焙食品开发与供应', evidence:'菜单、批次、适用供货条件', metric:'每日可供份数；损耗率；约定时段供货率' },
  bottle: { capability:'香氛或护理产品开发', evidence:'配方方向、样品、适用用途与测试', metric:'试样周期；盲测偏好率；可供批次量' },
  glass: { capability:'玻璃器物与材料工艺', evidence:'实物样品、来源与工艺、测试记录', metric:'良品率；约定性能达标率；交付周期' },
  lamp: { capability:'灯具设计与灯光体验', evidence:'灯具样品、光学参数、适用使用条件', metric:'照度 / 功耗等目标达标率；安装工期' },
  wheel: { capability:'骑行产品与部件', evidence:'部件样品、兼容范围、测试记录', metric:'目标车型适配率；测试达标率；供货期' },
  helmet: { capability:'头盔产品与骑行场景', evidence:'具体型号、测试材料、适用范围', metric:'项目规格覆盖率；可供数量；交付期' },
  leash: { capability:'宠物牵引用品', evidence:'样品、尺寸与材质、使用测试', metric:'目标尺寸覆盖率；约定强度达标率' },
  bone: { capability:'宠物玩具开发', evidence:'玩具样品、材质说明、使用测试', metric:'测试通过率；可交付件数；打样周期' },
  blocks: { capability:'原型开发或模块玩具', evidence:'可操作原型、设计文件、试验记录', metric:'关键功能完成率；迭代天数；打样数量' },
  puppet: { capability:'角色内容或木偶产品', evidence:'角色设定、内容样例、可使用范围', metric:'可用内容单元数；制作周期；项目适配度' },
  model: { capability:'空间设计与场景规划', evidence:'模型、图纸、场地条件、落地案例', metric:'可用面积；布撤展工时；关键动线通过率' },
  megaphone: { capability:'社群组织与运营', evidence:'运营记录、明确人群、可组织活动', metric:'目标人群有效到场率；复参与率' },
  ticket: { capability:'活动策划与执行', evidence:'执行方案、场地档期、负责人与预算', metric:'有效到场人数；任务准时完成率；单人成本' },
  pen: { capability:'文具产品或创作工具', evidence:'产品样品、具体用途、供货或作品记录', metric:'约定用途覆盖率；供货量；交付天数' },
  board: { capability:'产品设计与视觉方向', evidence:'署名案例、设计范围、可用人员', metric:'需求覆盖率；里程碑按时率；验收通过率' },
  ruler: { capability:'尺具产品或测量打版', evidence:'工具规格或打版案例、使用范围', metric:'约定精度达标率；打版周期；规格覆盖率' },
  wrench: { capability:'小批量制造与制作', evidence:'样品、设备与排产、历史交付', metric:'起订量；周产能；良品率；交期' },
  gear: { capability:'生产工程与工业零件', evidence:'工程图、工艺能力、测试与交付记录', metric:'公差达标率；峰值产能；稳定交付周期' },
  calculator: { capability:'财税处理与支持', evidence:'明确服务范围、交付样例、人员责任', metric:'范围内任务覆盖率；错误率；按期交付率' },
  folder: { capability:'报告整理与审计准备', evidence:'报告样例、资料清单、复核流程', metric:'资料完整率；复核差错率；周转天数' },
  compass: { capability:'户外装备或场景支持', evidence:'装备样品、适用条件、活动案例', metric:'目标场景覆盖率；可供套数；响应时长' },
  basket: { capability:'食材、茶或咖啡原料采购', evidence:'来源、可供批次、质量与交付约定', metric:'批次可追溯率；可供量；损耗率' },
  specimen: { capability:'植物或材料样本研究', evidence:'样本清单、实验条件、可复查记录', metric:'可用样本数；试验重复性；验证周期' },
  stamp: { capability:'拓印与印制工艺', evidence:'拓印样品、版式与材质、制作范围', metric:'约定精度达标率；每小时产出；换版时间' },
  speaker: { capability:'音箱产品或扩声体验', evidence:'型号或方案、场地条件、声音测试', metric:'目标面积覆盖；清晰度达标率；可用套数' },
  scanner: { capability:'扫码设备或识别流程', evidence:'设备演示、码制范围、接口与测试', metric:'识别成功率；单次耗时；流程完成率' },
  solar: { capability:'太阳能产品与发电模块', evidence:'具体样品、测试工况、可用接口', metric:'约定工况输出 W；转换表现；供货期' },
  battery: { capability:'便携储能与供电', evidence:'型号、测试工况、使用与维护范围', metric:'可用 Wh；续航小时；目标负载覆盖率' },
};
export const ACCESSORY_ROWS = PROP_CATALOG.map(([id,label])=>({id,label,...ACCESSORY_GUIDE[id]}));

export const REVIEW_RUBRIC: readonly {id:Dimension;label:string;weight:number;low:string;mid:string;high:string;unknown:string}[] = [
  {id:'intentFit',label:'目标契合',weight:RELATION_WEIGHTS.intentFit,low:'当期目标或时间明确冲突',mid:'存在交集，范围仍需协商',high:'具体方案分别服务双方明确的当期目标',unknown:'缺少目标、时间或优先级'},
  {id:'complementarity',label:'能力互补',weight:RELATION_WEIGHTS.complementarity,low:'配饰对应的能力没有补足需求，或角色重复',mid:'有单向补足，或具体投入待确认',high:'双方可投入的能力分别填补对方关键缺口，路径明确',unknown:'只有能力宣传，无法确定可投入范围'},
  {id:'audienceExpansion',label:'受众拓展',weight:RELATION_WEIGHTS.audienceExpansion,low:'没有合理的新触点或目标场景',mid:'存在相邻人群假设，进入路径待验证',high:'有进入新目标人群或场景的具体路径与依据',unknown:'受众构成或触达关系不明'},
  {id:'chemistry',label:'创意共鸣',weight:RELATION_WEIGHTS.chemistry,low:'表达冲突且没有共同叙事',mid:'方向可共存，但产物和共同表达仍抽象',high:'组合形成具体、易理解且有价值的表达或反差',unknown:'只知道行业、发色或性格标签'},
  {id:'feasibility',label:'执行可行',weight:RELATION_WEIGHTS.feasibility,low:'证据表明当前规模、工期或必要条件无法满足',mid:'部分可交付，关键环节仍待补齐',high:'当前规模、工期、负责人、承载与维护都有对应证据',unknown:'没有执行证据，不默认高分'},
];

/** Evidence review only. Does not overwrite the legacy discovery ranking. */
export function aggregateEvidenceReview(scores:Record<Dimension,number|null>):number|null {
  if(REVIEW_RUBRIC.some(({id})=>scores[id]===null)) return null;
  if(REVIEW_RUBRIC.some(({id})=>!Number.isFinite(scores[id]) || (scores[id] as number)<0 || (scores[id] as number)>100)) throw new RangeError('评分须为 0–100，未知填 null。');
  return Math.round(REVIEW_RUBRIC.reduce((total,{id,weight})=>total+scores[id]!*weight,0));
}
