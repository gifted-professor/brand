const STEPS = [
  ['upload', '上传资料'],
  ['profile', '品牌角色'],
  ['gravity', '引力匹配'],
  ['partner', '合作详情'],
  ['canvas', '共创画布'],
] as const;

export type JourneyStep = typeof STEPS[number][0];

export function JourneyFooter({ current }: { current: JourneyStep }) {
  const currentIndex = STEPS.findIndex(([step]) => step === current);
  return <footer className="journey-footer">
    <ol className="journey-path" aria-label="当前流程路径">{STEPS.map(([id, label], index) => <li key={id} aria-current={id === current ? 'step' : undefined} data-complete={currentIndex > index || undefined}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></li>)}</ol>
  </footer>;
}
