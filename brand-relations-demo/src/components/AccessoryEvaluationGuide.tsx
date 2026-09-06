import { useId } from 'react';
import { ACCESSORY_ROWS, REVIEW_RUBRIC } from '../domain/accessoryGuide';
import type { PropId } from '../domain/brandAppearance';
import { BrandProp } from './BrandProp';

export function AccessoryEvaluationGuide({propIds}:{propIds?:readonly PropId[]}) {
  const id=useId();
  const rows=propIds?ACCESSORY_ROWS.filter(row=>propIds.includes(row.id)):ACCESSORY_ROWS;
  return <details className="accessory-guide">
    <summary>配饰怎么对应能力与评分？<span aria-hidden="true">↗</span></summary>
    <div className="accessory-guide-content">
      <p className="accessory-guide-intro">先看配饰识别能力，再看资料和本次合作需要。发型与发色表达品牌气质；配饰的数量、大小、颜色不代表能力强弱。</p>
      <div className="accessory-reading"><span><b>手持物</b>主要产品或工具</span><span><b>随身装备</b>辅助能力或资源</span><span><b>内容挂件</b>补充品牌内容</span></div>
      <p className="accessory-scroll-hint">表格可上下、左右滚动查看。</p>
      <div className="accessory-table-wrap" role="region" aria-labelledby={`${id}-mapping`} tabIndex={0}>
        <table><caption id={`${id}-mapping`}>配饰与能力对照 · {rows.length} 项</caption><thead><tr><th scope="col">配饰 → 能力</th><th scope="col">核对什么资料</th><th scope="col">怎样量化</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row"><span className="accessory-table-icon"><svg viewBox="0 0 68 80" aria-hidden="true"><BrandProp id={row.id} color="#426f69" light="#dceae4"/></svg><span>{row.label}<small>{row.capability}</small></span></span></th><td>{row.evidence}</td><td>{row.metric}</td></tr>)}</tbody></table>
      </div>
      <p>指标要先约定目标、单位、测试条件与时间。产能更大、粉丝更多并不自动加分；适合本次规模、有可用证据才有意义。产品外形也不能证明服务能力、资质或安全认证。</p>
      <div className="accessory-table-wrap" role="region" aria-labelledby={`${id}-rubric`} tabIndex={0}>
        <table><caption id={`${id}-rubric`}>双方合作评价 · 每维 0–100</caption><thead><tr><th scope="col">维度 / 权重</th><th scope="col">低 0–39</th><th scope="col">中 40–69</th><th scope="col">高 70–100</th></tr></thead><tbody>{REVIEW_RUBRIC.map(row=><tr key={row.id}><th scope="row">{row.label}<small>{row.weight*100}%</small></th><td>{row.low}</td><td>{row.mid}</td><td>{row.high}</td></tr>)}</tbody></table>
      </div>
      <p className="accessory-score-formula">总分 = 目标 × 35% + 互补 × 30% + 受众 × 15% + 共鸣 × 15% + 执行 × 5%</p>
      <p>先记录每维依据，再按区间给分。关键资料未知时该维与总分均为「待核实」，不填 0、不重新分配权重。70–100 是高分区间，分差一两分没有已验证的商业含义；具体交付受阻时，高分也不能覆盖阻碍。</p>
      <p>例如，咖啡杯遇到包装盒：若只有咖啡品牌需要包装，互补仍是单向；双方分别确认咖啡体验与包装试点的需求、样品和投入后，才具备互补高分的依据。</p>
      <p className="accessory-guide-note">当前角色配饰来自品牌陈述，40 家虚构公司仅作演示。引力场现有分数是探索用的规则估算；本表用于有资料依据的进一步评审，不是自动认证或成功概率。三至四方组合需另查贡献、依赖与缺口，不平均两两评分。</p>
      <a href="/guides/accessory-evaluation-v1.md" download>下载完整评价表（43 种配饰） ↓</a>
    </div>
  </details>;
}
