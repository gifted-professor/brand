import type { deriveBrandHair } from '../domain/brandHair';
import { hairColorChannels } from '../domain/brandHair';
import { CHARACTER_PROTOTYPE as BASE, PROTOTYPE_HEAD } from '../domain/characterPrototype';

type HairLook=ReturnType<typeof deriveBrandHair>;
type Props={id:string;look:HairLook};
export function PrototypeHairDefinitions({id,look}:Props) {
  const [r,g,b]=hairColorChannels(look.color);
  return <>
    <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="1" y2=".65"><stop stopColor={look.color.highlight}/><stop offset=".36" stopColor={look.color.hex}/><stop offset="1" stopColor={look.color.shadow}/></linearGradient>
    <radialGradient id={`${id}-hair-round`} cx="32%" cy="25%" r="80%"><stop stopColor={look.color.highlight}/><stop offset=".56" stopColor={look.color.hex}/><stop offset="1" stopColor={look.color.shadow}/></radialGradient>
    <filter id={`${id}-hair-color`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncR type="table" tableValues={r}/><feFuncG type="table" tableValues={g}/><feFuncB type="table" tableValues={b}/></feComponentTransfer>
    </filter>
    <clipPath id={`${id}-hair-source`}><path d={PROTOTYPE_HEAD}/></clipPath>
    <clipPath id={`${id}-hair-short`}><path d="M300 100H850V509L760 525 714 550 643 561 610 606H476L425 561 382 520 300 502Z"/></clipPath>
    <clipPath id={`${id}-hair-crop`}><path d="M353 360Q355 218 518 203Q634 169 716 251Q772 316 763 446L713 504 635 561 610 606H476L424 531 384 501 352 443Z"/></clipPath>
  </>;
}

function Braid({x,y,flip=false,id,highlight}:{x:number;y:number;flip?:boolean;id:string;highlight:string}) {
  return <g transform={`translate(${x} ${y})${flip?' scale(-1 1)':''}`}>
    <path d="M-19-32Q56-52 49 10L35 217 14 252-2 218-22 30Z" fill={`url(#${id}-hair)`}/>
    {Array.from({length:6},(_,index)=><g key={index} transform={`translate(0 ${index*33})`}>
      <path d="M-13-5Q8-15 33 15L12 38Q-14 22-13-5ZM41-3Q22-12 1 18L20 39Q46 19 41-3Z" fill={`url(#${id}-hair-round)`}/>
      <path d="M-6 1 20 23M36 2 10 25" stroke={highlight} strokeWidth="2" opacity=".42"/>
    </g>)}
    <path d="M6 220 29 222" stroke="#decaa1" strokeWidth="7" strokeLinecap="round"/>
  </g>;
}

const curlCenters=[[369,265,43],[346,323,44],[332,380,43],[327,440,42],[333,497,42],[350,552,40],[379,584,34],[720,257,45],[758,311,45],[783,370,43],[793,429,43],[788,489,43],[771,544,42],[745,583,34]];

/** Rear silhouettes only. The unfiltered source face is restored above all these layers. */
export function PrototypeHairBack({id,look}:Props) {
  const hair=look.style.id,fill=`url(#${id}-hair)`,round=`url(#${id}-hair-round)`,shine=look.color.highlight;
  const waves=hair==='waves'||hair==='half-up';
  return <g data-appearance-layer="hair-silhouette" data-hair-shape={hair} fill={fill}>
    {hair==='bun'||hair==='half-up'?<><ellipse cx="657" cy={hair==='bun'?212:221} rx={hair==='bun'?90:63} ry={hair==='bun'?100:72} fill={round}/><path d="M595 175q48-62 101-8m-98 17q44-54 98-7m-88 22q48-45 91-4" fill="none" stroke={shine} strokeWidth="3" opacity=".38"/></>:null}
    {hair==='double-bun'?<>{[389,744].map((cx,index)=><g key={cx}><ellipse cx={cx} cy={219-index*8} rx="75" ry="82" fill={round}/><path d={`M${cx-50} 209q42-70 90-7m-92 22q44-61 94-4`} fill="none" stroke={shine} strokeWidth="3" opacity=".4"/></g>)}</>:null}
    {hair==='low-bun'?<><ellipse cx="769" cy="526" rx="68" ry="69" fill={round}/><path d="M786 480q-78 17-44 75t70-34q-11-51-49-13t31 33" fill="none" stroke={shine} strokeWidth="5" opacity=".42"/></>:null}
    {hair==='ponytail'?<><path d="M710 258Q838 217 854 350Q833 418 858 463Q891 522 833 620Q811 645 786 653Q827 595 792 548Q752 491 770 420Q792 351 720 339Z"/><path d="M771 288Q826 278 825 350Q798 444 838 500Q857 549 814 617M794 294Q847 333 815 409Q804 446 843 489" fill="none" stroke={shine} strokeWidth="4" opacity=".38"/><path d="m763 315 29-9" stroke="#d8c59e" strokeWidth="8"/></>:null}
    {hair==='low-pony'?<><path d="M725 440Q833 432 820 528Q795 581 833 641Q843 674 813 720Q813 675 782 650Q736 610 754 551L713 507Z"/><path d="M770 484q50 32 17 86t30 108" stroke={shine} strokeWidth="4" opacity=".38" fill="none"/><path d="m756 510 42 2" stroke="#cfb792" strokeWidth="8"/></>:null}
    {hair==='twin-tails'?<>{[false,true].map(flip=><g key={String(flip)} transform={flip?'translate(1135 0) scale(-1 1)':undefined}><path d="M357 364Q269 372 291 461Q312 503 286 557Q270 607 318 660Q296 618 337 589Q385 548 355 476L388 414Z"/><path d="M333 410q-37 44-8 91t-19 96" stroke={shine} strokeWidth="4" opacity=".4" fill="none"/><path d="m327 425 29-9" stroke="#d9c69f" strokeWidth="7"/></g>)}</>:null}
    {hair==='braid'||hair==='twin-braids'?<><Braid x={772} y={452} id={id} highlight={shine}/>{hair==='twin-braids'?<Braid x={349} y={449} flip id={id} highlight={shine}/>:null}</>:null}
    {waves?<><path d="M352 383Q300 431 326 483Q341 514 314 547Q294 591 333 611Q311 646 365 658Q407 666 424 628L444 495ZM730 371Q807 403 786 466Q773 502 803 529Q848 565 812 592Q841 628 793 646Q752 667 726 628L703 487Z"/><path d="M348 435q-18 33 2 61t-10 72q-21 33 19 57m407-192q27 25 1 61t26 54q30 20-2 49t-24 36" fill="none" stroke={shine} strokeWidth="5" opacity=".4"/></>:null}
    {hair==='long-straight'||hair==='lob'?<><path d={hair==='long-straight'?'M362 328Q319 380 331 482L316 742Q380 773 431 724L449 449H690L718 727Q772 763 808 731L785 470Q804 374 750 327Z':'M356 359Q323 414 342 493L331 625Q378 648 429 622L447 435H695L720 624Q772 647 805 616L779 471Q796 415 756 353Z'}/><path d={hair==='long-straight'?'M358 418 350 726m29-275-4 280m363-318 28 310m-34-230 20 234':'M359 426 362 610m30-150-10 154m356-192 30 187m-39-141 21 150'} stroke={shine} strokeWidth="4" opacity=".32" fill="none"/></>:null}
    {hair==='curly'?<>{curlCenters.map(([cx,cy,r],index)=><g key={index}><circle cx={cx} cy={cy} r={r} fill={round}/><path d={`M${cx-15} ${cy-16}q29-17 34 11t-30 19q-18-11 1-21`} fill="none" stroke={shine} strokeWidth="3" opacity=".4"/></g>)}</>:null}
  </g>;
}

export function PrototypeHairFront({id,look}:Props) {
  const clip=look.style.id==='bob'?undefined:`url(#${id}-${look.style.id==='crop'?'hair-crop':'hair-short'})`;
  return <g data-appearance-layer="hair-color" data-hair-color={look.color.hex} clipPath={clip}>
    <image data-prototype-layer="hair-texture" href={BASE.image} width={BASE.width} height={BASE.height} preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id}-hair-source)`} filter={`url(#${id}-hair-color)`}/>
  </g>;
}
