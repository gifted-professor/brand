import { describe,expect,it } from 'vitest';
import { deriveBrandAppearance } from './brandAppearance';
import { HAIR_COLORS,hairColorChannels } from './brandHair';
import { HAIRSTYLES } from './hairstyles';
import { generateMockBrands } from '../data/mockBrands';
import { displayBrand } from './chinese';

const base=generateMockBrands().find(brand=>brand.id==='memory-block')!;
describe('content-driven hair with separate capability equipment',()=>{
  it('responds to a changed brand category and product, not only the name',()=>{
    const coffee=deriveBrandAppearance({...base,name:'新品牌',category:'咖啡品牌',identity:'温暖、日常',offers:'我们制作咖啡杯。'});
    const digital=deriveBrandAppearance({...base,name:'新品牌',category:'人工智能技术公司',identity:'未来感、精确',offers:'我们制作交互终端。'});
    expect(coffee.hairLook.theme).toBe('coffee');expect(digital.hairLook.theme).toBe('technology');
    expect(coffee.hair).not.toBe(digital.hair);expect(coffee.hairLook.color.hex).not.toBe(digital.hairLook.color.hex);
    expect(coffee.props[0].id).toBe('coffee');expect(digital.props[0].id).toBe('tablet');
  });
  it('prioritizes explicit brand colors and hairstyles while excluding rejected colors',()=>{
    const brand={...base,category:'咖啡品牌',offers:'我们制作咖啡杯。',identity:'品牌主色 #2D86C4；双编发'};
    const look=deriveBrandAppearance(brand);
    expect(look.hair).toBe('twin-braids');expect(look.hairLook.color.hex).toBe('#2d86c4');expect(look.palette[0]).toBe('#2d86c4');
    expect(look.hairLook.explicitStyle).toBe(true);expect(look.hairLook.explicitColor).toBe(true);
    const edited=deriveBrandAppearance({...brand,identity:'不要蓝色；品牌色为栗子棕，发型侧编发'});
    expect(edited.hairLook.color.id).toBe('chestnut');expect(edited.hair).toBe('braid');expect(edited.props).toEqual(look.props);
    expect(deriveBrandAppearance({...brand,identity:'品牌色 #38b'}).hairLook.color.hex).toBe('#3388bb');
  });
  it('keeps wishes and matching scores out of capability equipment and style selection',()=>{
    const brand={...base,offers:'我们提供针织围巾。',identity:'薰衣草紫；垂顺长发'};
    const look=deriveBrandAppearance(brand);
    const changed=deriveBrandAppearance({...brand,needs:'我们寻找相机和芯片模块。',intent:'希望打造蓝色未来城市。',characterSeed:999});
    expect(changed).toEqual(look);expect(look.props.map(prop=>prop.id)).toEqual(['yarn']);
    expect(look.hairLook.color.id).toBe('lavender');expect(look.hair).toBe('long-straight');
  });
  it('offers varied, translation-stable looks for the forty fictional companies',()=>{
    const brands=generateMockBrands().filter(brand=>brand.fictional);const looks=brands.map(deriveBrandAppearance);
    expect(HAIRSTYLES).toHaveLength(16);expect(HAIR_COLORS).toHaveLength(18);
    expect(new Set(looks.map(look=>look.hair)).size).toBeGreaterThanOrEqual(12);
    expect(new Set(looks.map(look=>look.hairLook.color.hex)).size).toBeGreaterThanOrEqual(13);
    expect(new Set(looks.map(look=>look.signature)).size).toBe(40);
    for(const [index,brand] of brands.entries()){
      const translated=deriveBrandAppearance(displayBrand(brand));
      expect(translated.signature,brand.name).toBe(looks[index].signature);
      expect(translated.hairLook.theme,brand.name).toBe(looks[index].hairLook.theme);
    }
  });
  it('builds valid hair-only color tables for named and user-defined colors',()=>{
    for(const hair of [...HAIR_COLORS,deriveBrandAppearance({...base,identity:'品牌主色#00ff88'}).hairLook.color]){
      for(const channel of hairColorChannels(hair)){
        const values=channel.split(' ').map(Number);expect(values).toHaveLength(4);
        expect(values.every(value=>Number.isFinite(value)&&value>=0&&value<=1)).toBe(true);
      }
    }
  });
});
