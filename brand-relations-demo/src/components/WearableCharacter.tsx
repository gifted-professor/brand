import type { Brand, LOD } from '../domain/types';
import { brandWearable } from '../domain/wearables';
import { drawWearable } from '../domain/drawWardrobe';
import { BrandIPCharacter } from './BrandIPCharacter';
export function WearableCharacter({brand,lod='full',labelled=false,look=drawWearable(brand)}:{brand:Brand;lod?:LOD;labelled?:boolean;look?:ReturnType<typeof brandWearable>}) {
  return <BrandIPCharacter brand={brand} lod={lod} labelled={labelled} wardrobeUrl={look.source==='generated'?look.url:undefined}/>;
}
