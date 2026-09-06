import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessoryCharacter } from './AccessoryCharacter';
import { BrandCharacter } from './BrandCharacter';
import { describe, expect, it } from 'vitest';
import { standardExample } from './AvatarStandards';
import { ACCESSORY_FAMILIES, deriveAccessoryPlan } from '../domain/accessoryRules';
describe('fixed avatar reference examples',()=>{
  it('keeps the same body and drops only secondary equipment at simple LOD',()=>{
    const bare=standardExample('creative',0), equipped=standardExample('creative',3);
    const render=(brand:typeof bare,lod:'full'|'simple'|'marker'|'dormant')=>renderToStaticMarkup(createElement(BrandCharacter,{brand,lod}));
    expect(render(bare,'full').match(/<image[^>]+>/)?.[0]).toEqual(render(equipped,'full').match(/<image[^>]+>/)?.[0]);
    expect(render(bare,'full')).not.toContain('data-accessory');
    expect(renderToStaticMarkup(createElement(AccessoryCharacter,{brand:equipped}))).toContain('data-accessory="creative"');
    expect(render(equipped,'marker')).not.toContain('<image');
    expect(render(equipped,'dormant')).toBe('');
  });
  it('each visual family reaches exactly the evidence stage shown by its fictional material',()=>{
    for(const family of ACCESSORY_FAMILIES) for(let stage=0;stage<=3;stage++) {
      const brand=standardExample(family.id,stage);
      const plan=deriveAccessoryPlan(brand,brand.profile?.accessoryEvidence,'2026-09-06');
      expect(plan.primary?.level??0).toBe(stage);
      if(stage) expect(plan.primary?.id).toBe(family.id);
    }
  });
});
