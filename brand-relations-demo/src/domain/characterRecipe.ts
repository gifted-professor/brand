export const PART_IDS = ['head', 'body', 'antenna', 'legs', 'arms', 'cape'] as const;
export type PartId = typeof PART_IDS[number];
export type Silhouette = 'rounded' | 'faceted' | 'petal';
export interface CharacterPart { id: PartId; emphasis: number; evidence: string }
export interface CharacterRecipe {
  version: 1;
  source: 'ai' | 'local';
  name: string;
  silhouette: Silhouette;
  palette: number;
  signature: number;
  parts: CharacterPart[];
  capabilities: { id: string; evidence: string }[];
}
export interface CompanyBrief {
  name: string; category: string; offers: string; needs: string; identity: string;
}
