import {localProfile,brandFromProfile} from '../domain/brandProfile';
import {mockDataSource} from './source';
import type {Brand,WorldDataSource} from '../domain/types';
export const visualReferences = [
  {id:'louis-vuitton',name:'Louis Vuitton',ext:'jpg',pieces:'棕色短夹克、硬箱斜挎包、米白长裤与运动鞋',signals:'LV 字样、重复花纹、棕色皮革与金色五金',direction:'旅行收纳与日常穿搭'},
  {id:'chanel',name:'CHANEL',ext:'jpg',pieces:'浅色粗花呢外套、黑色链条包、黑色长裤',signals:'双 C 图形、菱格纹、黑白撞色与链条',direction:'织物质感与精细配件'},
  {id:'check-trench',name:'格纹风衣参考',ext:'jpg',pieces:'卡其短风衣、格纹围巾、小型斜挎包',signals:'格纹、双排扣、卡其色；图中出现混合标识，品牌归属待核对',direction:'通勤与季节性穿搭'},
  {id:'north-face',name:'The North Face',ext:'png',pieces:'黄黑户外外套、工装裤、徒步鞋与小包',signals:'The North Face 字样、户外装备轮廓、功能口袋',direction:'城市户外与轻量出行'},
  {id:'starbucks',name:'Starbucks',ext:'png',pieces:'绿色围裙、米色斜挎包、杯形挂饰',signals:'星巴克图形、咖啡杯、绿白配色',direction:'咖啡日常与随行用品'},
  {id:'supreme',name:'Supreme',ext:'jpg',pieces:'红色连帽衫、黑色小包、深色牛仔裤',signals:'Supreme 方框字标；鞋上另有勾形标识，不能据此确认真实联名',direction:'街头穿搭与随身配件'},
  {id:'nike',name:'Nike',ext:'jpg',pieces:'蓝色运动外套、小型斜挎包、工装裤和运动鞋',signals:'勾形标识、蓝白配色、运动轮廓',direction:'运动通勤与随身收纳'},
  {id:'adidas',name:'adidas',ext:'jpg',pieces:'绿色运动夹克、米白斜挎包、宽松长裤',signals:'三条纹、三叶草图形、复古运动配色',direction:'复古运动与城市日常'},
] as const;
export const fictionalLabBrand: Brand = brandFromProfile(localProfile([{id:'lab-home-doc',name:'未至日常-品牌介绍.txt',text:'品牌名称：未至日常\n品牌定位：虚构的城市生活用品品牌\n已有产品、能力与资源：提供模块化挎包、产品设计与小批量生产。\n希望伙伴带来什么：希望获得材料研发、零售空间和社群体验支持。\n这次联名的目标：探索一款适合通勤与周末出行的随身用品。\n目标消费者与使用场景：城市通勤者，随身携带手机、钥匙与水杯。\n品牌气质与视觉偏好：克制、轻巧、可修补。\n预算、时间与交付边界：仅作体验演示，预算、产能、许可均待确认。'}]),{id:'lab-home'} as Brand);
export const labBrands:Brand[]=[fictionalLabBrand,...visualReferences.map(item=>({id:`lab-${item.id}`,name:item.name,category:'图像穿搭参考',offers:`图中可见${item.pieces}。`,needs:'',intent:'',audience:'',identity:item.signals,constraints:'仅依据用户提供的形象图观察，品牌资源、授权和真实合作均未确认。',summary:`${item.direction}的视觉参考。${item.pieces}。`,characterSeed:1,avatarDataUrl:`/lab-avatars/${item.id}.${item.ext}`}))];
export const labDataSource:WorldDataSource={loadBrands:()=>labBrands,getRelations:(focus,brands)=>mockDataSource.getRelations(focus,brands)};
