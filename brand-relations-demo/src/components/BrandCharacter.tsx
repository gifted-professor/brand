import { memo, useId } from 'react';
import type { CSSProperties } from 'react';
import type { Brand, LOD } from '../domain/types';
import { describeBrandCharacter } from '../engines/character';
import { CapabilityGlyph } from './CapabilityIcon';
import { WearableCharacter } from './WearableCharacter';
import { brandWearable } from '../domain/wearables';
import { ParametricCharacter } from './ParametricCharacter';

/** Original vector artwork. Fixed anatomy, a semantic tool, and six art-directed palettes. */
export const LegacyBrandCharacter = memo(function LegacyBrandCharacter({ brand, lod = 'full', labelled = false }: {
  brand: Brand; lod?: LOD; labelled?: boolean;
}) {
  const patternId = `character-dots-${useId().replace(/:/g, '')}`;
  if (lod === 'dormant') return null;
  if (lod === 'marker') return <span className="far-marker" aria-hidden="true" />;
  if (brand.avatarDataUrl) return <img className={`character uploaded-character ${lod === 'simple' ? 'character-mid' : 'character-near'}`} src={brand.avatarDataUrl} alt={labelled ? `${brand.name}的角色` : ''} />;
  if (brand.character) return <ParametricCharacter brand={brand} recipe={brand.character} simple={lod === 'simple'} labelled={labelled} />;
  const { primary, palette } = describeBrandCharacter(brand);
  const style = { '--figure-ink': palette.ink, '--figure-mid': palette.mid, '--figure-light': palette.light, '--figure-accent': palette.accent } as CSSProperties;
  const simple = lod === 'simple';
  return <svg className={`character brand-character ${simple ? 'character-mid' : 'character-near'}`} style={style}
    viewBox="0 0 128 148" role={labelled ? 'img' : undefined} aria-label={labelled ? `${brand.name}: ${primary?.label ?? 'Capability not specified'}` : undefined}
    aria-hidden={labelled ? undefined : true} data-capability={primary?.id ?? 'unknown'}>
    {!simple ? <defs><pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".85" fill="currentColor" /></pattern></defs> : null}
    <ellipse cx="62" cy="140" rx="38" ry="4" className="figure-shadow" />
    <path d="M39 108h17v27H34v-7l5-4ZM64 108h17l4 16v11H64Z" className="figure-dark" />
    <path d="M34 65 49 57h27l17 12 5 30-15 12H34L23 97Z" className="figure-body" />
    <path d="m34 65 14 7-8 38h-6L23 97ZM75 59 93 69l5 30-15 12-9-39Z" className="figure-facet" />
    <path d="M48 60h27l-13 17Z" className="figure-light" />
    <path d="M40 17 60 10l23 9 6 27-12 17H46L33 47l1-19Z" className="figure-body" />
    <path d="m60 10 23 9 6 27-12 17-6-9 8-27Z" className="figure-facet" />
    <path d="m40 17 20-7 19 17-39 2Z" className="figure-light" />
    <path d="M42 33h35v15l-8 7H51l-9-7Z" className="figure-face" />
    <path d="M51 40v3m17-3v3" className="figure-line" />
    <path d="M56 49h7" className="figure-smile" />
    {!simple ? <>
      <path d="M33 72 48 77l-8 30H29l-6-10ZM73 65l10 7v35h-9Z" fill={`url(#${patternId})`} className="figure-halftone" />
      <path d="M43 89h20v18H43Z" className="figure-pocket" />
      <path d="M46 93h14" className="figure-seam" />
      <path d="M36 30v13M42 117v10m28-10v10" className="figure-seam" />
      <path d="M23 78 14 86l6 18 14-4Z" className="figure-light" />
      <path d="m19 89 6 9" className="figure-seam" />
    </> : null}
    <g transform="translate(78 67)" className="figure-tool">
      <path d="M0 7 7 0h32l7 7v38H0Z" className="figure-tool-case" />
      <path d="M4 7h38" className="figure-tool-accent" />
      <g transform="translate(8 13) scale(1.25)"><CapabilityGlyph id={primary?.id ?? 'unknown'} /></g>
    </g>
  </svg>;
});

/** V2 presentation. Old recipes and original vector component remain available for comparison. */
export const BrandCharacter = memo(function BrandCharacter(props: { brand: Brand; lod?: LOD; labelled?: boolean; look?: ReturnType<typeof brandWearable> }) {
  if (props.lod === 'dormant') return null;
  if (props.lod === 'marker') return <span className="far-marker" aria-hidden="true" />;
  if (props.lod === 'signature') {
    const words = props.brand.name.trim().split(/\s+/u);
    const initials = (words.length > 1 ? words.slice(0, 2).map(word => Array.from(word)[0]).join('') : Array.from(words[0] || '?').slice(0, 2).join('')).toLocaleUpperCase();
    return <span className="brand-signature" aria-hidden="true">{initials}</span>;
  }
  return <WearableCharacter {...props} />;
});
