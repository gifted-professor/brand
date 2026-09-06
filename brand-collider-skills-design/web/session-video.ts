import type { Session } from '../src/collider-types.ts';
import type { ProductionProject } from '../src/production-types.ts';
export function sessionVideoArtifacts(session: Session): Pick<ProductionProject, 'nodes' | 'assets' | 'edges'> {
  const video = session.video;
  if (!video || video.revision !== session.revision) return { nodes: [], assets: [], edges: [] };
  const labels = { preparing: '准备参考物料', running: '视频制作中', awaiting_input: '等待你的选择', ready: '制作轮次结束 · 待导出', exporting: '正在导出视频', completed: '成片已保存', recoverable: '等待恢复原视频任务', failed: '视频制作未完成' };
  let index = 0;
  const actions = video.pendingActions.filter(action => action.blocking).map(action => [action.message, action.payload ? JSON.stringify(action.payload) : '',
    ...((action.options || []).map(option => `${++index}. ${option.label || option.id}（${option.effect === 'resume' ? '继续制作' : option.effect === 'open_url' ? '打开页面处理' : '保持当前状态'}）；在对话中输入“选择视频选项${index}”`)),
    action.action_url ? `操作页面：${action.action_url}` : ''].filter(Boolean).join('\n')).join('\n\n');
  const final = video.assets.findLast(asset => asset.final);
  return {
    nodes: [{ id: 'promo-video', kind: 'video', lane: 'video', title: '联名宣传视频',
      summary: video.summary, status: ['preparing', 'running', 'exporting'].includes(video.status) ? 'running' : video.status === 'completed' ? 'available' : video.status === 'failed' ? 'failed' : 'needs_revision',
      statusLabel: labels[video.status], content: [`${video.model} · ${video.resolution} · ${video.aspectRatio} 横屏 · 约 ${video.duration} 秒`, video.summary,
        actions, video.projectUrl ? `[在 Flova 查看项目](${video.projectUrl})` : '',
        `参考物料：${video.sources.map(source => source.name).join('、')}`].filter(Boolean).join('\n\n'),
      assetIds: video.assets.map(asset => asset.id), ...(final ? { primaryAssetId: final.id } : {}),
      sources: video.sources.map(source => ({ label: source.name, sha256: source.hash })), tags: ['宣传视频', `v${video.revision}`] }],
    assets: video.assets.map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind, url: asset.url, downloadUrl: `${asset.url}&download=1`,
      mimeType: asset.mimeType, size: asset.size, sha256: asset.hash })),
    edges: video.sources.filter(source => source.kind === 'material').map(source => ({ id: `media-material-${source.id}-to-video`, source: `media-material-${source.id}`, target: 'promo-video', label: '已验收物料参考' })),
  };
}
