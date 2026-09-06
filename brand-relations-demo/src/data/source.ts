import type { WorldDataSource } from '../domain/types';
import { calculateMockRelation } from '../engines/relation';
import { generateMockBrands } from './mockBrands';

export const mockDataSource: WorldDataSource = {
  loadBrands: generateMockBrands,
  getRelations: (focus, brands) => brands.filter(brand => brand.id !== focus.id).map(brand => calculateMockRelation(focus, brand)),
};
