import {describe,it,expect} from 'vitest';
import {brandWearable,BASE_AVATAR} from './wearables';
import {generateMockBrands} from '../data/mockBrands';
const brand=generateMockBrands()[0];
describe('product-based wardrobe',()=>{
  it('uses documented product types without treating wishes or partners as products',()=>{
    expect(brandWearable({...brand,offers:'我们提供再生纤维围巾。'}).url).toContain('scarf');
    expect(brandWearable({...brand,offers:'提供城市夹克。'}).url).toContain('jacket');
    expect(brandWearable({...brand,offers:'提供模块化挎包。'}).url).toContain('bag');
    for(const offers of ['希望寻找围巾品牌','合作方提供夹克','没有包袋产品','提供产品设计服务']) expect(brandWearable({...brand,offers}).url).toBe(BASE_AVATAR);
  });
  it('uses only local generated asset URLs and labels examples honestly',()=>{
    const profile={documents:[],evidence:[],gaps:[],summary:'',source:'local' as const};
    const url='/api/collider/avatar-assets/12345678-1234-1234-1234-123456789012.png';
    expect(brandWearable({...brand,profile:{...profile,wearable:{url,source:'generated'}}}).source).toBe('generated');
    expect(brandWearable({...brand,offers:'围巾',profile:{...profile,wearable:{url:'https://example.com/fake.png',source:'generated'}}}).source).toBe('example');
  });
});
