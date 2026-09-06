# 原 COLLIDER 画板接入 · 2026-09-06

上游：https://github.com/gifted-professor/brand/ ，基于 `b47faa75a009ea00d0be645584240bdb309e97df`。

## 主流程

`App.startInvitation` 创建本地合作记录及两张有来源标识的渠道模板，然后直接导航至 `canvas.html`。不要求对方先同意，不再经过额外的简报 / 预演 / 邀请 / 共创四步页面。已有 `#project` 书签同样转入。

`POST /api/canvas/open` 以项目与简报版本作为幂等键，创建或恢复原 runtime 会话。重新打开同一版本不会重建会话，也不会自动发起模型请求。用户在画板提交“生成预演 / 更新预演”后，调用原 `intervene(restartFrom: 1)` 与 `run`；每次修订保留历史发言和原项目素材。原生工作台的普通讨论行为保持不变，只有宿主传入 `channelPreviewMode` 时启用此按钮行为。

## 直接复用

- 前端：上游 `web/App.tsx`、原 `ProductionWorkspace` / `ProductionCanvas`、`sessionProduction`、原会话及物料详情组件。
- 服务端：上游 `createHttpServer` 的 HTTP router、`ColliderRuntime`、六项 Skill、研究 / 创意 / 设计 / 文案 / 视觉 / 审查流程及导出。
- `RelationsProductionRepository` 将 `ProjectStore` 的两方品牌、原有 VI、草案和两张渠道预演转换为上游 `ProductionProject`。素材读取仍经过原宿主项目资产接口。
- 原图、原型角色、历史页面、所有生成文件与旧任务成果均保留。

## 样式与运行修复

发现页和画板采用两个 Vite HTML 入口，避免双方的全局按钮、卡片、圆角规则相互覆盖；都复用同一套 `#2457F5` / `#111111` / 白色视觉。封面 Logo 居中、上传入口为完整圆角矩形。手机宽度下画板与对话上下排列，图片缩略图完整显示。

本地 Codex 文本适配器原来只允许一个请求，与上游双方并行研究冲突。现在允许两条并行调用，其余进入有界队列；暂停和关闭服务会取消对应请求，旧结果由原 runtime 版本校验隔离。

配置图片服务后，画板 runtime 使用上游原生 `CodexCliProvider` 完成真实素材检索与图片检查，才启用原逐件自动制作；快速表单提案仍使用轻量文本适配器。图片或 CLI 能力不满足时按实际能力显示，不把文本适配器伪装成可看图服务。

## 来源与能力边界

案例照片来自本项目已有的内置图像生成结果；每次创建生成的 SVG 是确定性品牌版式，标为“模板预演”。本轮文字调用使用原 runtime 与本机配置的模型。没有图片 API / 看图能力时不会启动逐件自动出图与视觉验收。用户真实上传的 VI 缺失时显示中性占位与待补充说明，不把平台虚拟视觉当成其官方 VI。

本地文件保存在 `outputs/brand-relations-projects`、`outputs/collider-sessions`、`outputs/canvas-links`，均不纳入 git。不要并行启动两个会写入同一会话目录的 API 进程。当前提交包含主仓库与 COLLIDER 子模块的本地代码提交；集成版画板提交发布在 `KAI-NEX/brand-relations-demo` 的 `collider-integration` 分支，主仓库固定引用该提交；递归克隆即可获取完整源码。

## 验证

`pnpm test`、`pnpm lint`、`pnpm build`。新增集成回归覆盖原 router 的创建、修订、执行、导出、会话恢复、两方视觉分离、来源标记、未知项目及 SVG 文本转义；并发测试覆盖两方研究同时执行、第三条排队和取消后不再启动。浏览器验证从案例进入原画板、提交真实文字生成、查看成果、返回项目以及窄屏布局。
