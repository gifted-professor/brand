import { describe, expect, it } from 'vitest';
import { brandHairstyle, HAIRSTYLES } from './hairstyles';

describe('brand hairstyles', () => {
  it('keeps a stable visual identity across name formatting variations', () => {
    expect(brandHairstyle('  ＦＯＲＭ   works  ')).toEqual(brandHairstyle('Form Works'));
  });
  it('distributes brands across every supported hairstyle', () => {
    const styles = new Set(Array.from({ length: 100 }, (_, i) => brandHairstyle(`示例品牌${i}`).id));
    expect(styles).toEqual(new Set(HAIRSTYLES.map(style => style.id)));
  });
});
