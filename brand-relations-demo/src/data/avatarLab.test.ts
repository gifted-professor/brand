import { describe, expect, it } from 'vitest';
import { fictionalLabBrand, labBrands, labDataSource, visualReferences } from './avatarLab';
import { brandWearable } from '../domain/wearables';
import { brandFromProfile, localProfile } from '../domain/brandProfile';

describe('isolated visual lab', () => {
  it('keeps provided visual references separate from confirmed commercial capabilities', () => {
    expect(visualReferences).toHaveLength(8);
    expect(labBrands).toHaveLength(9);
    for (const brand of labBrands.slice(1)) {
      expect(brand.id.startsWith('lab-')).toBe(true);
      expect(brandWearable(brand).url).toBe(brand.avatarDataUrl);
      expect(brand.needs).toBe('');
      expect(brand.intent).toBe('');
      expect(brand.constraints).toContain('未确认');
    }
    expect(fictionalLabBrand.name).toBe('未至日常');
    expect(labDataSource.getRelations(fictionalLabBrand, labBrands)).toHaveLength(8);
  });
  it('preserves a supplied lab portrait while locally editing its material', () => {
    const initial = labBrands[1];
    const result = brandFromProfile(localProfile([{ id: 'note', name: 'demo.txt', text: '品牌名称：本地试穿\n已有产品、能力与资源：夹克' }]), initial);
    expect(brandWearable(result).url).toBe(initial.avatarDataUrl);
    expect(brandWearable({ ...initial, id: 'company-normal' }).url).not.toBe(initial.avatarDataUrl);
  });
});
