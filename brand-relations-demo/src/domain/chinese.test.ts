import {describe,expect,it} from 'vitest';
import {displayBrand} from './chinese';
import {generateMockBrands} from '../data/mockBrands';

describe('Chinese presentation boundary',()=>{
  it('translates every built-in field without mutating original scoring snapshots',()=>{
    const brands=generateMockBrands();const before=JSON.stringify(brands);
    for(const brand of brands){
      const shown=displayBrand(brand);
      expect(shown.id).toBe(brand.id);
      if(brand.fictional) expect(shown.name).toMatch(/[\u4e00-\u9fff]/);
      else expect(shown.name).toBe(brand.name);
      for(const field of ['category','offers','needs','intent','audience','identity','constraints'] as const){
        expect(shown[field]).toMatch(/[\u4e00-\u9fff]/);
        expect(shown[field]).not.toMatch(/[a-z]{3,}/i);
      }
    }
    expect(JSON.stringify(brands)).toBe(before);
  });
  it('does not rewrite uploaded user content or reference brand names',()=>{
    const uploaded={...generateMockBrands()[0],id:'company-example',offers:'My own material description'};
    expect(displayBrand(uploaded)).toBe(uploaded);
  });
});
