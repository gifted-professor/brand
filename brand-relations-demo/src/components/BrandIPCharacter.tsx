import { memo, useId } from 'react';
import type { Brand, LOD } from '../domain/types';
import { deriveBrandAppearance } from '../domain/brandAppearance';
import { BrandProp } from './BrandProp';

/** Layered identity: anatomy stays stable; the equipment reacts to the current brand brief. */
export { PrototypeCharacter as BrandIPCharacter } from './PrototypeCharacter';
// Retained for comparison with the rejected vector reconstruction.
export const ExploratoryBrandIPCharacter = memo(function ExploratoryBrandIPCharacter({brand,lod='full',labelled=false}:{brand:Brand;lod?:LOD;labelled?:boolean}) {
  const look = deriveBrandAppearance(brand);
  const id = `ip-${useId().replace(/:/g,'')}`;
  const fill = (name:string)=>`url(#${id}-${name})`;
  const [color,light,accent] = look.palette;
  const portrait = lod === 'portrait';
  const simple = lod === 'simple';
  return <svg className={`character brand-character semantic-character ${portrait?'brand-bust':simple?'character-mid':'character-near'}`} viewBox="0 0 256 320" role={labelled?'img':undefined} aria-hidden={labelled?undefined:true} aria-label={labelled?`${brand.name} · ${look.label}`:undefined} data-character-signature={look.signature} data-hairstyle={look.hair}>
    <defs>
      <radialGradient id={`${id}-skin`} cx="35%" cy="25%" r="80%"><stop stopColor="#ffe6c9"/><stop offset=".6" stopColor="#f6c69f"/><stop offset="1" stopColor="#d68e6d"/></radialGradient>
      <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e8ada0"/><stop offset=".4" stopColor="#c98175"/><stop offset="1" stopColor="#8c534e"/></linearGradient>
      <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="1" y2=".6"><stop stopColor={light}/><stop offset=".35" stopColor={color}/><stop offset="1" stopColor={color}/></linearGradient>
      <linearGradient id={`${id}-pants`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#8b8d88"/><stop offset=".5" stopColor="#626965"/><stop offset="1" stopColor="#454e4d"/></linearGradient>
      <radialGradient id={`${id}-eye`} cx="40%" cy="65%" r="70%"><stop stopColor="#9f653e"/><stop offset=".6" stopColor="#493329"/><stop offset="1" stopColor="#201f25"/></radialGradient>
    </defs>
    <g className="ip-body">
      <ellipse cx="130" cy="307" rx="58" ry="5" fill="#3e4149" opacity=".07"/>
      {/* Straps and larger tools sit behind the shoulder, never as floating badges. */}
      <path d="M165 151q34 3 35 37v54q-2 17-25 13l-19-17Z" fill={accent}/>
      <path d="M100 236h28l-2 59H94q-4-20 6-59ZM132 236h28q10 39 6 59h-31Z" fill={fill('pants')}/>
      <path d="M98 256q14 6 25 0m15 0q13 6 25-1M97 281h26m16 0h24" stroke="#e3e2da" strokeWidth="1.7" opacity=".25" fill="none"/>
      <path d="M94 285h32l2 18q-8 8-39 4-7-5 5-22ZM136 285h28q17 17 10 22-29 5-40-4Z" fill="#eae1d1" stroke="#b7a998" strokeWidth="1.4"/>
      <path d="M92 300h32m15 0h32M100 289h15m-17 5h18m26-5h13m-11 5h13" stroke="#bda78e" strokeWidth="2" strokeLinecap="round"/>
      <path d="M101 146q28-15 55 0l21 27-10 76q-36 16-74-1l-9-75Z" fill={fill('cloth')} stroke={color} strokeWidth="1.2"/>
      <path d="M115 132h27v25q-12 12-27 0Z" fill={fill('skin')}/>
      <path d="m101 147 15-5 12 16 14-16 14 5-18 21h-21Z" fill={light}/>
      {look.garment==='apron'?<><path d="m111 160-7 86q24 12 53 0l-10-86Z" fill={accent}/><path d="m108 145 4 21m34-21-1 21M107 218h45m-29-27h26v18h-26Z" stroke="#765a44" strokeWidth="2" fill="none"/><path d="m126 218-14 17 17-3 10 13-2-27" fill="#fff3d2" opacity=".45"/></>:look.garment==='vest'?<><path d="m99 146-8 96 27 6 8-87Z" fill={accent}/><path d="m155 146 14 96-32 6-7-87Z" fill={accent}/><path d="M95 188h22v23H95Zm44 0h23v23h-23Z" fill={color}/><path d="M93 224h25m20 0h24" stroke={light} strokeWidth="3"/></>:<><path d="M128 165v82" stroke={light} strokeWidth="2"/><path d="M100 203h19v25h-19Zm39 0h20v25h-20Z" fill={light} opacity=".38"/>{look.garment==='knit'?<path d="M99 179h58m-59 8h62m-62 48h64" stroke={light} strokeWidth="2" opacity=".5"/>:null}</>}
      <path d="M97 151q-18-1-23 25l-10 38q6 12 19 5l19-48ZM158 152q21 1 27 28l12 36q-5 10-17 8l-22-49" fill={fill('cloth')} stroke={color} strokeWidth="1.5"/>
      <path d="m73 199 17 7m85-2 17-4" stroke={light} strokeWidth="5"/>
      <path d="m164 150-54 89" stroke="#473d35" strokeWidth="7" opacity=".65"/>
      <path d="m164 150-54 89" stroke={accent} strokeWidth="4"/>
    </g>
    <g className="ip-head" strokeLinejoin="round">
      {look.hair==='ponytail'?<path d="M161 38q46-35 55 1-1 33-9 48 17 40-17 51 11-32-6-44-28-23-23-56Z" fill={fill('hair')}/>:look.hair==='bun'?<ellipse cx="137" cy="27" rx="29" ry="24" fill={fill('hair')}/>:null}
      <path d={look.hair==='waves'?'M77 55q5-45 54-36 53-4 55 45-5 18 5 42 17 22-3 37 6 20-16 26-23-9-15-35H98q9 23-15 28-25-2-13-27-16-17-1-39Z':look.hair==='pixie'?'M76 77q-7-61 49-64 59-3 58 64l-10 32H86Z':'M78 74q-9-57 49-58 60-1 55 64l-7 52q-17 18-46 12-29 7-52-13Z'} fill={fill('hair')}/>
      <ellipse cx="79" cy="93" rx="10" ry="15" fill={fill('skin')}/><ellipse cx="177" cy="93" rx="10" ry="15" fill={fill('skin')}/>
      <path d="M80 64Q127 25 176 62l-2 46q-3 36-45 42-43-5-47-39Z" fill={fill('skin')}/>
      <ellipse cx="101" cy="118" rx="10" ry="6" fill="#de9a86" opacity=".4"/><ellipse cx="155" cy="118" rx="10" ry="6" fill="#de9a86" opacity=".4"/>
      <path d="M91 94q13-13 26 1-8 27-24 8Z" fill="#fff7ed"/><path d="M139 95q13-13 26-1l-2 10q-18 18-24-9Z" fill="#fff7ed"/>
      <ellipse cx="106" cy="100" rx="10" ry="13" fill={fill('eye')}/><ellipse cx="151" cy="100" rx="10" ry="13" fill={fill('eye')}/>
      <ellipse cx="106" cy="99" rx="5" ry="8" fill="#25232a"/><ellipse cx="151" cy="99" rx="5" ry="8" fill="#25232a"/>
      <circle cx="102" cy="94" r="3.4" fill="white"/><circle cx="147" cy="94" r="3.4" fill="white"/><circle cx="110" cy="105" r="1.4" fill="white"/><circle cx="155" cy="105" r="1.4" fill="white"/>
      <path d="M91 94q13-12 26 1m22 0q13-12 26-1" fill="none" stroke="#533b33" strokeWidth="3" strokeLinecap="round"/>
      <path d="M94 81q9-5 18 0m33-1q10-5 17 0" fill="none" stroke="#8b5a4c" strokeWidth="4" strokeLinecap="round"/>
      <ellipse cx="128" cy="115" rx="4.5" ry="3.4" fill="#e2a184"/><path d="M121 129q8 5 15-1" stroke="#b57560" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d={look.hair==='pixie'?'M77 84q-15-40 24-56l32-16-4 9 31-3-11 9 28 9-12 3 16 24-10 21-5-27q-37 14-37-9-15 26-48 34Z':look.hair==='bun'||look.hair==='ponytail'?'M79 92Q60 34 125 28q59-4 53 56-8-21-27-31-18-3-36 15-21 17-36 24Z':'M80 94Q59 39 114 23q62-13 65 54-14-15-23-31-10 27-32 33l5-23q-20 34-49 38Z'} fill={fill('hair')}/>
      <path d="M87 60q10-21 36-25M91 71q21-16 30-28m19-10q19 5 28 24" stroke="#f3b9a7" strokeWidth="2.5" opacity=".45" fill="none" strokeLinecap="round"/>
    </g>
    <g className="ip-equipment">
      {look.props[0]?<g transform="translate(23 172) scale(.88)" data-prop={look.props[0].id}><title>{`${look.props[0].label}：${look.props[0].evidence}`}</title><BrandProp id={look.props[0].id} color={color} light={light}/></g>:null}
      <ellipse cx="78" cy="214" rx="9" ry="12" transform="rotate(-16 78 214)" fill={fill('skin')}/>
      {look.props[1]?<g transform="translate(163 204) scale(.76)" data-prop={look.props[1].id}><title>{`${look.props[1].label}：${look.props[1].evidence}`}</title><BrandProp id={look.props[1].id} color={color} light={light}/></g>:null}
      <ellipse cx="185" cy="215" rx="8" ry="10" transform="rotate(-25 185 215)" fill={fill('skin')}/>
      {look.props[2]&&!simple?<g transform="translate(131 175) scale(.29)" data-prop={look.props[2].id}><title>{`${look.props[2].label}：${look.props[2].evidence}`}</title><path d="M32-9V8" stroke="#c6aa72" strokeWidth="6"/><BrandProp id={look.props[2].id} color={color} light={light}/></g>:null}
    </g>
  </svg>;
});
