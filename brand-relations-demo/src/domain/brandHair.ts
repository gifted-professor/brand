import type { Brand } from './types';
import { hash } from './hash';
import { HAIRSTYLES } from './hairstyles';
import type { HairstyleId } from './hairstyles';

type HairColor = { id:string;label:string;hex:string;shadow:string;highlight:string };
const mix=(hex:string,target:number,amount:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-amount)+target*amount).toString(16).padStart(2,'0')).join('');
const color=(id:string,label:string,hex:string):HairColor=>({id,label,hex,shadow:mix(hex,0,.61),highlight:mix(hex,255,.48)});
export const HAIR_COLORS = [
  color('rose','玫瑰棕','#bb8479'),color('espresso','浓缩咖啡','#54382e'),color('chestnut','栗子棕','#8c5338'),
  color('copper','陶土铜','#b9603e'),color('caramel','焦糖金','#bb8749'),color('wheat','麦穗金','#d1b17c'),
  color('pine','松针绿','#355b48'),color('sage','鼠尾草绿','#829879'),color('jade','青玉绿','#358e82'),
  color('navy','深海蓝','#304d75'),color('blue','钴蓝','#416eb7'),color('ice','雾冰蓝','#92b5c9'),
  color('silver','月光银','#aeb5c3'),color('graphite','石墨黑','#41444e'),color('plum','烟紫','#73536f'),
  color('lavender','薰衣草紫','#a18ab6'),color('coral','珊瑚粉','#d88789'),color('burgundy','莓果红','#893e53'),
] as const;
type ColorId = typeof HAIR_COLORS[number]['id'];
interface Theme { id:string;label:string;props:readonly string[];category:RegExp;styles:readonly HairstyleId[];colors:readonly ColorId[];mood:string }
const themes:readonly Theme[]=[
  {id:'tea',label:'茶与植物',props:['tea','basket'],category:/茶|tea/i,styles:['low-bun','braid','long-straight'],colors:['pine','sage','espresso'],mood:'自然、沉静'},
  {id:'coffee',label:'咖啡日常',props:['coffee'],category:/咖啡|coffee/i,styles:['bun','curly','low-pony'],colors:['espresso','chestnut','caramel'],mood:'温暖、日常'},
  {id:'bakery',label:'谷物烘焙',props:['bread'],category:/食品|烘焙|food|bakery/i,styles:['double-bun','bun','twin-braids'],colors:['wheat','caramel','copper'],mood:'温暖、手作'},
  {id:'botanical',label:'植物与循环',props:['plant','watering','specimen','swatches'],category:/园艺|材料|material|gardening/i,styles:['braid','twin-braids','half-up'],colors:['sage','pine','jade'],mood:'自然、生长'},
  {id:'ceramic',label:'陶艺手作',props:['vase','lamp'],category:/工艺|灯具|craft/i,styles:['low-bun','bun','waves'],colors:['copper','chestnut','caramel'],mood:'触感、手工'},
  {id:'glass',label:'透明器物',props:['glass'],category:/玻璃|glass/i,styles:['lob','waves','long-straight'],colors:['ice','jade','silver'],mood:'通透、轻盈'},
  {id:'technology',label:'数字科技',props:['tablet','chip','solar','battery'],category:/技术|电子|数字|能源|technology|electronics|digital/i,styles:['crop','pixie','bob','half-up'],colors:['silver','blue','ice','navy'],mood:'清晰、未来'},
  {id:'sound',label:'声音实验',props:['headphones','recorder','speaker'],category:/声音|sound/i,styles:['curly','half-up','crop'],colors:['plum','navy','burgundy'],mood:'节奏、实验'},
  {id:'publishing',label:'出版与文化',props:['book','stamp'],category:/出版|博物馆|文化|publisher|museum|cultural/i,styles:['lob','long-straight','low-bun'],colors:['graphite','burgundy','plum'],mood:'叙事、沉静'},
  {id:'image',label:'影像创作',props:['camera'],category:/影像|媒体|media|photography/i,styles:['pixie','low-pony','lob'],colors:['graphite','silver','plum'],mood:'观察、独立'},
  {id:'textile',label:'纺织穿搭',props:['yarn','ruler','leash'],category:/时尚|纺织|宠物|fashion|textile/i,styles:['twin-braids','braid','half-up','waves'],colors:['rose','lavender','sage','burgundy'],mood:'柔软、编织'},
  {id:'playful',label:'玩具与创意',props:['puppet','blocks','pen','megaphone','ticket'],category:/玩具|文具|社群|活动|toy|community|event|experimental design/i,styles:['double-bun','twin-tails','curly','half-up'],colors:['coral','lavender','caramel','jade'],mood:'好奇、活力'},
  {id:'outdoor',label:'户外行动',props:['wheel','helmet','compass'],category:/户外|骑行|outdoor|cycling/i,styles:['ponytail','twin-braids','crop'],colors:['pine','navy','copper'],mood:'行动、探索'},
  {id:'scent',label:'气味与护理',props:['bottle'],category:/气味|护理|香氛|scent|care/i,styles:['waves','long-straight','low-bun'],colors:['lavender','rose','jade'],mood:'感官、柔和'},
  {id:'workshop',label:'制造与工具',props:['wrench','gear','crate','scanner','calculator','folder'],category:/制造|物流|财税|manufacturer|logistics|accounting/i,styles:['crop','pixie','low-pony','bob'],colors:['graphite','navy','chestnut'],mood:'精确、务实'},
  {id:'objects',label:'空间与结构',props:['model','board','parcel'],category:/空间|家具|包装|furniture|space|spatial|packaging/i,styles:['bob','lob','low-pony'],colors:['caramel','graphite','ice'],mood:'秩序、结构'},
];
const styleCues:readonly [HairstyleId,RegExp][]=[
  ['twin-braids',/双编发|双麻花|twin braids/i],['double-bun',/双丸子|双发髻|space buns|double buns/i],
  ['twin-tails',/双马尾|twin tails|pigtails/i],['low-bun',/低盘发|低发髻|low bun/i],['low-pony',/低马尾|低束马尾|low pony/i],
  ['half-up',/半扎|half.up/i],['long-straight',/长直发|垂顺长发|long straight/i],['lob',/齐肩|long bob|\blob\b/i],
  ['curly',/蓬松卷|小卷|curly|curls/i],['waves',/波浪|大卷|waves|wavy/i],['braid',/编发|麻花辫|braid/i],
  ['ponytail',/高马尾|马尾|ponytail/i],['bun',/丸子头|盘发|发髻|\bbun\b/i],['pixie',/精灵短发|pixie/i],
  ['crop',/利落短发|极短发|寸头|cropped|\bcrop\b/i],['bob',/波波头|\bbob\b/i],
];
const colorCues:readonly [string,RegExp][]=[
  ['sage',/鼠尾草|灰绿|sage/i],['pine',/松针|森林绿|墨绿|pine|forest green/i],['jade',/青玉|青绿|薄荷|绿|jade|teal|mint|green/i],
  ['ice',/冰蓝|雾蓝|浅蓝|ice blue|pale blue/i],['navy',/深海蓝|藏蓝|深蓝|navy/i],['blue',/钴蓝|蓝|cobalt|blue/i],
  ['silver',/月光银|银|灰|silver|grey|gray/i],['graphite',/石墨|黑|graphite|black/i],['lavender',/薰衣草|浅紫|lavender/i],
  ['plum',/烟紫|紫|plum|purple|violet/i],['coral',/珊瑚|粉|coral|pink/i],['burgundy',/莓果|酒红|红|burgundy|red/i],
  ['espresso',/咖啡棕|深棕|espresso/i],['rose',/玫瑰棕|rose brown/i],['copper',/陶土|铜|橙|copper|terracotta|orange/i],
  ['wheat',/麦穗|浅金|米金|黄|wheat|blond|yellow/i],['caramel',/焦糖|金|caramel|gold/i],['chestnut',/栗|棕|chestnut|brown/i],
];
const normalize=(text:string)=>text.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const pick=<T,>(items:readonly T[],seed:number):T=>items[seed%items.length];

/** Brand content selects the family; the stable visual seed only chooses variation within that family. */
export function deriveBrandHair(brand:Pick<Brand,'name'|'category'|'identity'|'visualSeed'>,props:readonly {id:string;label:string;evidence:string}[]) {
  const visualSeed=normalize(brand.visualSeed ?? brand.name);
  const seed=hash(visualSeed);
  const identity=brand.identity.split(/[，,;；。！？\n]/u).filter(clause=>!/不要|避免|不使用|不采用|without|avoid|\bnot\b|\bno\b/i.test(clause)).join(' ');
  const primary=props[0];
  const ranked=themes.map(theme=>({theme,score:Number(Boolean(primary&&theme.props.includes(primary.id)))*10+Number(theme.category.test(brand.category))*6})).sort((a,b)=>b.score-a.score);
  const theme=ranked[0].score?ranked[0].theme:undefined;
  const explicitStyle=styleCues.find(([,pattern])=>pattern.test(identity));
  // Mood is an aesthetic cue, not evidence that a brand owns a capability.
  const moods:readonly [RegExp,readonly HairstyleId[]][]=[
    [/未来|科技|futuristic/i,['crop','pixie','bob','half-up']],
    [/趣味|活泼|playful/i,['double-bun','twin-tails','curly','half-up']],
    [/传统|traditional/i,['low-bun','braid','twin-braids']],
    [/冒险|探索|adventurous/i,['ponytail','twin-braids','crop']],
    [/正式|严谨|formal/i,['bob','low-bun','crop']],
    [/柔和|柔软|soft|gentle/i,['waves','long-straight','lob']],
  ];
  const mood=moods.find(([pattern])=>pattern.test(identity));
  const common=mood&&theme?theme.styles.filter(style=>mood[1].includes(style)):[];
  const pool=common.length?common:theme?.styles??mood?.[1]??HAIRSTYLES.map(style=>style.id);
  const style=HAIRSTYLES.find(style=>style.id===(explicitStyle?.[0]??pick(pool,seed)))!;
  const hex=identity.match(/#([a-f\d]{6}|[a-f\d]{3})\b/i)?.[1];
  const namedColor=colorCues.find(([,pattern])=>pattern.test(identity));
  const selectedColor=hex?color(`brand-${hex.toLowerCase()}`,'品牌指定色',`#${hex.length===3?[...hex].map(c=>c+c).join(''):hex}`.toLowerCase())
    :HAIR_COLORS.find(item=>item.id===(namedColor?.[0]??(theme?pick(theme.colors,hash(`${visualSeed}:color`)):'rose')))!;
  const explicitColor=Boolean(hex||namedColor);
  return {style,color:selectedColor,theme:theme?.id??'neutral',themeLabel:theme?.label??'品牌日常',
    reason:explicitColor?`采用品牌视觉偏好中的${hex?`#${hex}`:selectedColor.label}`:theme?`${theme.label} · ${theme.mood}`:'资料较少，保留原型色系',
    evidence:primary?.label??brand.category,explicitStyle:Boolean(explicitStyle),explicitColor};
}

/** Preserve photographed hair texture with a color lookup; never apply this to the skin layer. */
export function hairColorChannels(hair:HairColor) {
  return [1,3,5].map(i=>[hair.shadow,hair.hex,hair.highlight,'#ffffff'].map(hex=>(parseInt(hex.slice(i,i+2),16)/255).toFixed(4)).join(' '));
}
