import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateMockBrands } from '../data/mockBrands';
import { CHARACTER_PROTOTYPE } from '../domain/characterPrototype';
import { BrandCharacter } from './BrandCharacter';

const render=(brand:ReturnType<typeof generateMockBrands>[number],lod:'full'|'portrait'='full')=>renderToStaticMarkup(createElement(BrandCharacter,{brand,lod}));
const anatomy=(html:string,part:string)=>html.match(new RegExp(`<g data-anatomy-layer="${part}"[^>]*>(.*?)</g>`))?.[1].replace(/clip-path="url\(#[^"]+\)"/g,'clip-path="url(#prototype-ID)"');

describe('user prototype anatomy lock',()=>{
  it('keeps the uploaded master byte-for-byte, not an AI or vector reinterpretation',()=>{
    const bytes=readFileSync(`public${CHARACTER_PROTOTYPE.image}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('0106e090f78f1bb49a17577e55bd1184c2e9d3c9ee6dbed93bda13662b50ddeb');
  });
  it('uses identical source pixels and dimensions for every face and body across 40 brands and LODs',()=>{
    const brands=generateMockBrands();
    const baseline=render(brands[0]);
    for(const brand of brands)for(const lod of ['full','portrait'] as const){
      const html=render(brand,lod);
      expect(html).toContain(`viewBox="${lod==='portrait'?CHARACTER_PROTOTYPE.portraitViewBox:CHARACTER_PROTOTYPE.viewBox}"`);
      if(lod==='portrait'){
        expect(html).not.toContain('data-anatomy-layer="body"');
        expect(html).not.toContain('data-appearance-layer="equipment"');
        expect(html).not.toContain('data-appearance-layer="clothing"');
      }
      for(const part of lod==='portrait'?['face']:['face','body']){
        expect(anatomy(html,part)).toBe(anatomy(baseline,part));
        expect(anatomy(html,part)).toContain(`href="${CHARACTER_PROTOTYPE.image}"`);
        expect(anatomy(html,part)).toContain('width="1122" height="1402"');
        expect(anatomy(html,part)).not.toMatch(/transform=|filter=|<path|<ellipse/);
      }
    }
  });
  it('updates equipment without moving the anatomy and confines AI results to clothing',()=>{
    const brand=generateMockBrands()[0];
    const first=render({...brand,offers:'我们制作茶壶。'});
    const edited=render({...brand,offers:'我们制作茶壶；竹编茶篮；出版绘本。'});
    expect(first).not.toContain('data-prop="book"');
    expect(edited).toContain('data-prop="book"');
    for(const part of ['face','body'])expect(anatomy(edited,part)).toBe(anatomy(first,part));
    const url='/api/collider/avatar-assets/12345678-1234-1234-1234-123456789012.png';
    const generated=render({...brand,profile:{documents:[],evidence:[],gaps:[],summary:'',source:'local',wearable:{url,source:'generated'}}});
    for(const part of ['face','body'])expect(anatomy(generated,part)).toBe(anatomy(first,part));
    expect(generated).toMatch(/data-prototype-layer="generated-clothing-only"[^>]+clip-path="url\(#[^"]+-wardrobe\)"/);
    expect(generated).toMatch(/data-prototype-layer="generated-clothing-only"[^>]+width="1122" height="1402"/);
  });
  it('changes hair color and silhouette without filtering or replacing the locked face and body',()=>{
    const brand=generateMockBrands()[0];
    const pink=render({...brand,identity:'珊瑚粉；双丸子头'});
    const blue=render({...brand,identity:'品牌主色#2457f5；侧编发'});
    expect(pink).toContain('data-hair-shape="double-bun"');expect(blue).toContain('data-hair-shape="braid"');
    expect(blue).toContain('data-hair-color="#2457f5"');
    expect(blue).toMatch(/data-prototype-layer="hair-texture"[^>]+filter="url\(#[^"]+-hair-color\)"/);
    for(const part of ['face','body'])expect(anatomy(blue,part)).toBe(anatomy(pink,part));
    expect(blue.indexOf('data-anatomy-layer="face"')).toBeGreaterThan(blue.indexOf('data-prototype-layer="hair-texture"'));
  });
});
