import {describe,it,expect} from 'vitest';
import {generateMockBrands} from '../data/mockBrands';
import {deriveBrandAppearance} from './brandAppearance';
import {displayBrand} from './chinese';

const base=generateMockBrands().find(brand=>brand.id==='memory-block')!;
describe('brand information becomes visible equipment',()=>{
  it('gives all 40 fictional companies a distinct, sourced identity',()=>{
    const brands=generateMockBrands().filter(brand=>brand.fictional);
    expect(brands).toHaveLength(40);
    expect(brands.every(brand=>brand.fictional)).toBe(true);
    const looks=brands.map(deriveBrandAppearance);
    expect(new Set(looks.map(look=>look.signature)).size).toBe(40);
    for(const [index,look] of looks.entries()){
      expect(look.props.length).toBeGreaterThanOrEqual(2);
      for(const prop of look.props)expect(brands[index].offers).toContain(prop.evidence);
      expect(deriveBrandAppearance(displayBrand(brands[index])).signature,brands[index].name).toBe(look.signature);
    }
  });
  it('reacts to product additions and removal while preserving personal identity',()=>{
    const original={...base,offers:'我们制作茶壶；竹编茶篮。'};
    const first=deriveBrandAppearance(original);
    const added=deriveBrandAppearance({...original,offers:original.offers+'我们也出版故事绘本。'});
    expect(first.props.map(prop=>prop.id)).toEqual(['tea','basket']);
    expect(added.props.map(prop=>prop.id)).toEqual(['tea','basket','book']);
    expect(added.hair).toBe(first.hair);expect(added.palette).toEqual(first.palette);
    expect(deriveBrandAppearance({...original,id:'company-preview-id'}).palette).toEqual(first.palette);
    expect(deriveBrandAppearance({...original,offers:'我们制作茶壶。'}).props.map(prop=>prop.id)).toEqual(['tea']);
  });
  it('does not turn wishes, negation or other companies’ products into equipment',()=>{
    for(const offers of ['希望寻找茶壶品牌。','我们不提供相机。','合作方提供太阳能板。','We need coffee roasting.','Our supplier provides ceramics.','We plan to offer camera products.']){
      expect(deriveBrandAppearance({...base,offers}).props,offers).toEqual([]);
    }
    const first=deriveBrandAppearance({...base,offers:'我们制作针织围巾。'});
    expect(deriveBrandAppearance({...base,offers:'我们制作针织围巾。',needs:'太阳能板、相机、陶器',intent:'成为全世界最强品牌'})).toEqual(first);
  });
});
