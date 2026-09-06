import { describe, it, expect } from 'vitest';
import { ACCESSORY_ROWS, aggregateEvidenceReview } from './accessoryGuide';
import { PROP_CATALOG } from './brandAppearance';
import { brandIPDesign } from './brandIPDesign';
import { generateMockBrands } from '../data/mockBrands';

describe('capability evidence and appearance stay separate',()=>{
  it('explains every rendered accessory and requires evidence before a weighted result',()=>{
    expect(ACCESSORY_ROWS.map(row=>row.id)).toEqual(PROP_CATALOG.map(([id])=>id));
    expect(aggregateEvidenceReview({intentFit:80,complementarity:85,audienceExpansion:70,chemistry:75,feasibility:80})).toBe(79);
    expect(aggregateEvidenceReview({intentFit:80,complementarity:85,audienceExpansion:70,chemistry:75,feasibility:null})).toBeNull();
    expect(()=>aggregateEvidenceReview({intentFit:101,complementarity:85,audienceExpansion:70,chemistry:75,feasibility:80})).toThrow();
  });
  it('every fictional brand uses the same source and separately grounded styling',()=>{
    const designs=generateMockBrands().map(brandIPDesign);
    expect(designs.every(design=>design.skill==='$brand-ip-imagegen')).toBe(true);
    expect(new Set(designs.map(design=>design.prototype)).size).toBe(1);
    expect(new Set(designs.map(design=>design.look.signature)).size).toBe(designs.length);
    for(const design of designs) {
      expect(design.styling).toContain('Remove in the new image only');
      expect(design.styling).toContain('Do not move the hands');
      expect(design.styling).toContain('not quality, seniority or a numerical score');
      expect(design.equipment.every(item=>item.evidence&&item.capability)).toBe(true);
    }
  });
});
