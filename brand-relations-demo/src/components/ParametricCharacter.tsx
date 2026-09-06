import type { CSSProperties } from 'react';
import type { Brand } from '../domain/types';
import type { CharacterRecipe } from '../domain/characterRecipe';
import { CHARACTER_PALETTES, describeBrandCharacter } from '../engines/character';
import { profileCoverage } from '../domain/brandProfile';
import { partSize } from '../engines/characterGenome';
import { CapabilityGlyph } from './CapabilityIcon';

export function ParametricCharacter({ brand, recipe, simple, labelled }: { brand: Brand; recipe: CharacterRecipe; simple: boolean; labelled: boolean }) {
  const palette = CHARACTER_PALETTES[recipe.palette];
  const { primary } = describeBrandCharacter(brand);
  const head = partSize(recipe, 'head'), body = partSize(recipe, 'body'), arms = partSize(recipe, 'arms');
  const legs = partSize(recipe, 'legs'), antenna = partSize(recipe, 'antenna'), cape = partSize(recipe, 'cape');
  const left = 90 - body / 2, right = 90 + body / 2;
  const hem = 120 + legs;
  const style = { '--figure-ink': palette.ink, '--figure-mid': palette.mid, '--figure-light': palette.light, '--figure-accent': palette.accent } as CSSProperties;
  const headShape = recipe.silhouette === 'faceted'
    ? `M${90-head} 42 80 ${55-head} 101 ${55-head} ${90+head} 44 ${90+head-3} 67 102 ${55+head} 77 ${55+head} ${90-head} 66Z`
    : recipe.silhouette === 'petal'
      ? `M90 ${55-head}C104 ${48-head} ${98+head} 35 ${88+head} 51C${105+head} 69 110 ${66+head} 90 ${53+head}C70 ${66+head} ${75-head} 69 ${92-head} 51C${82-head} 35 76 ${48-head} 90 ${55-head}Z`
      : `M${90-head} 47Q${90-head} ${55-head} 90 ${55-head}Q${90+head} ${55-head} ${90+head} 47V64Q${90+head} ${55+head} 90 ${55+head}Q${90-head} ${55+head} ${90-head} 64Z`;
  return <svg className={`character brand-character parametric-character ${brand.profile ? profileCoverage(brand) < .4 ? 'profile-sketch' : profileCoverage(brand) < .75 ? 'profile-forming' : 'profile-ready' : ''} ${simple ? 'character-mid' : 'character-near'}`} viewBox="0 0 180 190" style={style}
    role={labelled ? 'img' : undefined} aria-label={labelled ? `${brand.name} · ${recipe.name} · ${primary?.label ?? '待补充能力'}` : undefined}
    aria-hidden={labelled ? undefined : true} data-capability={primary?.id ?? 'unknown'} data-silhouette={recipe.silhouette} data-signature={recipe.signature}>
    <ellipse cx="90" cy={132 + legs} rx="48" ry="4" className="figure-shadow" />
    <g data-part="cape" data-size={cape}>
      <path d={`M${left+5} 91Q${left-cape} 116 ${left-cape+3} ${hem}Q90 ${hem+3} ${right+cape-3} ${hem}Q${right+cape} 116 ${right-5} 91Z`} fill="var(--figure-accent)" opacity=".7" />
      {!simple ? <path d={`M${left+5} 104 ${left-cape+9} ${hem-6}M${right-5} 104 ${right+cape-9} ${hem-6}`} className="figure-seam" /> : null}
    </g>
    <g data-part="legs" data-size={legs} className="figure-dark">
      <path d={`M${left+8} 128h17v${legs}h-24v-8l7-4ZM${right-25} 128h17v${legs-12}l7 4v8h-24Z`} />
      {!simple ? <path d={`M${left+10} ${129+legs}h11m${body-32} 0h11`} stroke="var(--figure-accent)" strokeWidth="2" /> : null}
    </g>
    <g data-part="arms" data-size={arms}>
      <path d={`M${left+1} 97Q${left-arms} 95 ${left-arms+1} 126l13 4q-2-18 ${arms-10}-16ZM${right-1} 97Q${right+arms} 95 ${right+arms-1} 126l-13 4q2-18 ${10-arms}-16Z`} className="figure-body" />
      <circle cx={left-arms+8} cy="127" r="6.5" className="figure-light" />
      <circle cx={right+arms-8} cy="127" r="6.5" className="figure-light" />
    </g>
    <g data-part="body" data-size={body}>
      <path d={`M${left+7} 86H${right-7}L${right} 102v32H${left}v-32Z`} className="figure-body" />
      {recipe.silhouette === 'faceted' ? <path d={`M90 86 ${right} 102v32H90l9-28Z`} className="figure-facet" /> : null}
      <path d="M78 86h24l-12 14Z" className="figure-light" />
      {!simple ? <g className="figure-signature" stroke="var(--figure-light)" strokeWidth="2.3" strokeLinecap="round">
        {[0,1,2,3,4].map(index => <path key={index} d={`M${78+index*6} 115v${4+((recipe.signature >>> (index*3))&7)}`} />)}
      </g> : null}
    </g>
    <g data-part="antenna" data-size={antenna}>
      <path d={`M90 ${58-head}v-${antenna}`} stroke="var(--figure-ink)" strokeWidth="3" fill="none" />
      <circle cx="90" cy={58-head-antenna} r="3.5" fill="var(--figure-accent)" />
    </g>
    <g data-part="head" data-size={head}>
      <path d={headShape} className="figure-body" />
      {recipe.silhouette === 'faceted' ? <path d={`M80 ${55-head}h21l${head-11} ${head-11}-29 3Z`} className="figure-light" /> : null}
      <rect x="72" y="46" width="36" height="26" rx={recipe.silhouette === 'faceted' ? 5 : 12} className="figure-face" />
      <path d="M81 56v3m18-3v3" className="figure-line" />
      <path d="M87 65q3 2 6 0" className="figure-smile" />
    </g>
    <g className="figure-tool" transform={`translate(${right+3} 111)`}>
      <rect width="36" height="39" rx={recipe.silhouette === 'faceted' ? 3 : 9} className="figure-tool-case" />
      <path d="M7 5h22" className="figure-tool-accent" />
      <g transform="translate(6 10)"><CapabilityGlyph id={primary?.id ?? 'unknown'} /></g>
    </g>
  </svg>;
}
