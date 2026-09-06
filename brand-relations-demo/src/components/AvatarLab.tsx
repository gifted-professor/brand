import {useState} from 'react';
import App from '../App';
import {fictionalLabBrand,labDataSource,visualReferences} from '../data/avatarLab';
import {Icon} from './Icon';
export default function AvatarLab(){
  const [selected,setSelected]=useState<string>(visualReferences[0].id);
  const [exploring,setExploring]=useState(false);
  const item=visualReferences.find(item=>item.id===selected)!;
  if(exploring)return <><div className="lab-session-bar"><button onClick={()=>setExploring(false)}>← 返回实验室</button><span>本地实验 · 不写入品牌库</span></div><App dataSource={labDataSource} demoBrand={fictionalLabBrand} localOnly initialPage="matching"/></>;
  return <div className="flow-shell avatar-lab"><header className="flow-header"><a className="flow-logo" href="/" aria-label="返回首页"><img src="/vi/mark-black.svg" alt=""/></a></header><main>
    <a className="lab-back" href="/"><Icon name="back"/>返回</a><div className="lab-heading"><p>形象实验室</p><h1>同一个角色，穿出不同品牌。</h1><p>以下内容依据你提供的图片观察；仅在前端演示，不代表已确认的品牌合作。</p></div>
    <div className="lab-layout"><section className="lab-portrait"><img src={`/lab-avatars/${item.id}.${item.ext}`} alt={`${item.name}形象参考`}/></section><section className="lab-observations"><h2>{item.name}</h2><dl><dt>图中产品</dt><dd>{item.pieces}</dd><dt>识别线索</dt><dd>{item.signals}</dd><dt>可以探索的方向</dt><dd>{item.direction}，需要进一步补充具体产品和消费者依据。</dd><dt>还不能从图片判断</dt><dd>授权、预算、消费者需求、产能及合作意向。</dd></dl><div className="lab-fictional"><small>你的虚构品牌</small><h3>{fictionalLabBrand.name}</h3><p>模块化挎包与城市生活用品，寻找材料、空间和体验伙伴。</p><button className="flow-primary" onClick={()=>setExploring(true)}>用这个品牌体验引力匹配 <Icon name="arrow"/></button></div></section></div>
    <nav className="lab-gallery" aria-label="品牌形象参考">{visualReferences.map(ref=><button key={ref.id} aria-pressed={selected===ref.id} onClick={()=>setSelected(ref.id)}><img src={`/lab-avatars/${ref.id}.${ref.ext}`} alt=""/><span>{ref.name}</span></button>)}</nav>
  </main></div>;
}
