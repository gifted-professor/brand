import { memo, useId } from 'react';
import type { Brand, LOD } from '../domain/types';
import { deriveBrandAppearance } from '../domain/brandAppearance';
import { CHARACTER_PROTOTYPE as BASE, PROTOTYPE_BODY, PROTOTYPE_FACE, PROTOTYPE_HAND, PROTOTYPE_WARDROBE } from '../domain/characterPrototype';
import { BrandProp } from './BrandProp';
import { deriveBrandHair } from '../domain/brandHair';
import { PrototypeHairDefinitions, PrototypeHairBack, PrototypeHairFront } from './PrototypeHair';

const BASE_HAIR=deriveBrandHair({name:'基础角色',category:'',identity:'侧分波波头；玫瑰棕'},[]);

/** The original image owns all facial features and body dimensions. Brand data owns only styling. */
export const PrototypeCharacter = memo(function PrototypeCharacter({brand,lod='full',labelled=false,wardrobeUrl}:{brand?:Brand;lod?:LOD;labelled?:boolean;wardrobeUrl?:string}) {
  const portrait=lod==='portrait';
  const appearance=brand?deriveBrandAppearance(brand):null;
  const hairLook=appearance?.hairLook??BASE_HAIR;
  const hair=hairLook.style.id;
  const [color,light,accent]=appearance?.palette??['#796350','#e7dcc9','#9cae82'];
  const id=`prototype-${useId().replace(/:/g,'')}`;
  const url=(part:string)=>`url(#${id}-${part})`;
  const source=(clip:string,extra?:string)=><image data-prototype-layer={extra??clip} href={BASE.image} width={BASE.width} height={BASE.height} preserveAspectRatio="xMidYMid meet" clipPath={url(clip)}/>;
  return <svg className={`character brand-character semantic-character prototype-character ${lod==='portrait'?'brand-bust':lod==='simple'?'character-mid':'character-near'}`} viewBox={portrait ? BASE.portraitViewBox : BASE.viewBox} role={labelled?'img':undefined} aria-hidden={labelled?undefined:true} aria-label={labelled?`${brand?.name??'基础角色'} · ${appearance?.label??'原型五官与身体'}`:undefined} data-character-signature={appearance?.signature??'prototype'} data-hairstyle={hair} data-hair-color={hairLook.color.hex} data-hair-theme={hairLook.theme} data-anatomy={BASE.version}>
    <defs>
      <clipPath id={`${id}-body`}><path d={PROTOTYPE_BODY}/></clipPath>
      <clipPath id={`${id}-face`}><path d={PROTOTYPE_FACE}/></clipPath>
      <clipPath id={`${id}-hand`}><path d={PROTOTYPE_HAND}/></clipPath>
      <clipPath id={`${id}-wardrobe`}><path d={PROTOTYPE_WARDROBE}/></clipPath>
      <PrototypeHairDefinitions id={id} look={hairLook}/>
      <pattern id={`${id}-fabric`} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 1 4 5 8 1M0 5 4 9 8 5" fill="none" stroke={light} strokeWidth="1" opacity=".22"/></pattern>
    </defs>
    {/* Hair additions sit behind the source face; they cannot replace a facial feature. */}
    <PrototypeHairBack id={id} look={hairLook}/>
    {!portrait ? <g data-anatomy-layer="body">{source('body')}</g> : null}
    {/* Clothing remains inside the original silhouette; no geometry or skin filters. */}
    {!portrait ? <g data-appearance-layer="clothing" clipPath={url('body')}>
      <path d="M447 637 486 611 509 659 545 684 593 648 618 609 679 627 662 779 650 900Q536 924 431 878Z" fill={color} opacity=".36" style={{mixBlendMode:'color'}}/>
      <path d="M438 868Q551 896 651 868L650 901Q542 923 431 882Z" fill={color}/>
      <path d="M486 618 506 655 545 686 593 645 611 612" stroke={color} strokeWidth="12" fill="none"/>
      <path d="M576 713Q604 705 638 719L631 762Q604 771 576 756Z" fill={color}/>
      <path d="M576 713Q604 705 638 719L631 762Q604 771 576 756Z" fill={url('fabric')}/>
      <path d="M387 864 474 879 469 967Q415 990 373 966L373 907Z" fill={color}/>
      <path d="M387 864 474 879 469 967Q415 990 373 966L373 907Z" fill={url('fabric')} stroke={accent} strokeWidth="2"/>
      {wardrobeUrl?<image data-prototype-layer="generated-clothing-only" href={wardrobeUrl} width={BASE.width} height={BASE.height} preserveAspectRatio="xMidYMid meet" clipPath={url('wardrobe')}/>:null}
    </g> : null}
    <PrototypeHairFront id={id} look={hairLook}/>
    {/* Restore exact source face last, even when a generated wardrobe was supplied. */}
    <g data-anatomy-layer="face">{source('face')}</g>
    {!portrait ? <g data-appearance-layer="equipment">
      {appearance?.props[0]?<g transform="translate(230 850) scale(2.05)" data-prop={appearance.props[0].id}><title>{`${appearance.props[0].label}：${appearance.props[0].evidence}`}</title><path d="M52 24 62 35" stroke={accent} strokeWidth="3"/><BrandProp id={appearance.props[0].id} color={color} light={light}/></g>:null}
      {appearance?.props[1]?<g transform="translate(673 880) scale(1.65)" data-prop={appearance.props[1].id}><title>{`${appearance.props[1].label}：${appearance.props[1].evidence}`}</title><path d="M32-18V10" stroke={accent} strokeWidth="4"/><BrandProp id={appearance.props[1].id} color={color} light={light}/></g>:null}
      {appearance?.props[2]&&lod!=='simple'?<g transform="translate(582 710) scale(.73)" data-prop={appearance.props[2].id}><title>{`${appearance.props[2].label}：${appearance.props[2].evidence}`}</title><BrandProp id={appearance.props[2].id} color={color} light={light}/></g>:null}
    </g> : null}
    {!portrait ? source('hand','original-hand') : null}
  </svg>;
});
