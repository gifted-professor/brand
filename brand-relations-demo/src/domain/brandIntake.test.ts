import { describe, expect, it } from 'vitest';
import { emptyIntake, brandFromIntake, exampleIntake, parseBrandIntake } from './brandIntake';

describe('brand information intake', () => {
  it('parses the downloadable JSON shape and preserves evidence', () => {
    const parsed = parseBrandIntake(JSON.stringify(exampleIntake));
    expect(parsed.name).toBe(exampleIntake.name);
    expect(parsed.supportingEvidence).toBe(exampleIntake.supportingEvidence);
  });

  it('parses labelled markdown fields', () => {
    const parsed = parseBrandIntake('品牌名称：测试品牌\n已有产品、能力与资源：产品设计和原型制作\n联名目标：试做小批量产品');
    expect(parsed).toMatchObject({ name: '测试品牌', offers: '产品设计和原型制作', intent: '试做小批量产品' });
  });

  it('generates a character while retaining matching inputs', () => {
    const brand = brandFromIntake(exampleIntake);
    expect(brand.id).toMatch(/^company-/);
    expect(brand.character?.parts).toHaveLength(6);
    expect(brand.intent).toBe(exampleIntake.intent);
    expect(brand.audience).toBe(exampleIntake.audience);
    expect(brand.constraints).toBe(exampleIntake.constraints);
  });

  it('accepts the minimum brief without inventing optional information', () => {
    const brand = brandFromIntake({ ...emptyIntake, name: '试验品牌', category: '设计工作室', offers: '提供产品设计与原型制作' });
    expect(brand.needs).toBe(''); expect(brand.intent).toBe(''); expect(brand.audience).toBe('');
  });

  it('rejects a missing required field', () => {
    expect(() => brandFromIntake({ ...exampleIntake, offers: '' })).toThrow('已有产品');
  });
});
