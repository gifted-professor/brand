import { describe, expect, it } from 'vitest';
import { demoAnchorBrands } from './demoBrands';
import { INTAKE_FIELDS, intakeFromBrand, missingMatchingFields } from '../domain/brandIntake';
import { brandFromProfile, validateDocuments } from '../domain/brandProfile';
import { mockDataSource } from './source';

describe('ready-to-use demonstration materials', () => {
  it('prepares valid documents and traceable fields for both featured brands', () => {
    for (const brand of demoAnchorBrands()) {
      const profile = brand.profile!;
      expect(validateDocuments(profile.documents)).toHaveLength(8);
      expect(profile.source).toBe('local');
      for (const { key } of INTAKE_FIELDS) {
        expect(brand[key]).toBeTruthy();
        expect(profile.evidence.some(ref => ref.field === key && profile.documents.some(doc => doc.id === ref.documentId && doc.text.includes(ref.quote)))).toBe(true);
      }
      expect(profile.documents[7].text).toContain('一对一');
      expect(profile.documents[7].text).toContain('各自保留完整品牌 VI');
      expect(profile.documents[7].text).toContain('尚未获得双方授权');
    }
  });

  it('carries the prepared profile, existing portrait and public contact through the next step', () => {
    const original = demoAnchorBrands()[0];
    const next = brandFromProfile({ fields: intakeFromBrand(original), profile: original.profile! }, original);
    expect(next.id).toBe(original.id);
    expect(next.avatarDataUrl).toBe(original.avatarDataUrl);
    expect(next.contact).toEqual(original.contact);
    expect(next.fictional).toBe(false);
    expect(next.summary).toBe(original.summary);
    expect(next.profile?.documents).toHaveLength(8);
    expect(missingMatchingFields(next)).toEqual([]);
    const pool = mockDataSource.loadBrands(1);
    expect(pool).toHaveLength(42);
    const ranked = [...mockDataSource.getRelations(next, pool)].sort((a, b) => b.collaborationFit - a.collaborationFit);
    expect(ranked[0].targetBrandId).toBe('nailong');
  });

  it('does not reuse the demo portrait when the user changes the brand identity', () => {
    const original = demoAnchorBrands()[0];
    const fields = { ...intakeFromBrand(original), name: '我的品牌', identity: '蓝色、冷静' };
    const next = brandFromProfile({ fields, profile: original.profile! }, original);
    expect(next.avatarDataUrl).toBeUndefined();
    expect(original.avatarDataUrl).toBeTruthy();
    expect(next.name).toBe('我的品牌');
  });
});
