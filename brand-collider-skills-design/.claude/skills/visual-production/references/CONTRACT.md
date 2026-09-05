# visual-production：局部契约参考

版本：1.0。以下工具和字段是项目约定，需要后端实现。

## 公共提交协议

逻辑工具：submit_artifact。默认 SDK 映射为 mcp__collider__submit_artifact。

输入：`{ type, schemaVersion: "1.0", baseRevision, parentRefs, payload }`。

`parentRefs` 为 `{ artifactId, contentHash }[]`。项目身份、任务 ID、生产 Skill 信息从宿主上下文读取，不接受模型覆盖。

成功：`{ artifactId, contentHash, revision, validation: { structural, ruleFindings } }`。

失败：`{ error: { code, message, fieldErrors, retryable } }`；不得返回虚假保存结果。

ArtifactRecord 的 ID、时间、版本、哈希由后端生成。以下描述的都是 payload。


## RenderPlan

- `designRef`：当前设计 ID 和哈希。
- `stylePackRef`：`{ id, version }`。
- `hero`：`{ prompt, negativePrompt, referenceAssetIds }`。
- `poster`：`{ templateId, templateVersion, copyRef, imageSource: "reuse_hero" }`。
- 服务端验证引用、模型能力、限额；不能仅凭 Agent 填字段就视为方案通过。
- 只改海报时允许沿用原主图的渲染计划引用；不得因为重新提交 RenderPlan 就默认生图。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## read_asset

输入 `{ assetId }`。只读取当前任务允许的素材。支持视觉时返回图像内容及元信息；不支持时返回 capability_unavailable，不能以文本描述冒充读取实际图片。


## image_generate

输入 `{ designArtifactId, renderPlanArtifactId }`。不接受模型提供 endpoint、API key、输出目录或任意模型 ID。

宿主检查用户选择、当前版本、设计规则、有效 pre_render 报告和生成限额。prompt 必须与设计绑定；参考素材必须在当前授权范围内。

返回 `{ assetId, contentHash, generationStatus, reviewStatus, providerRequestId }`。reviewStatus 初始为 unverified。请求超时且供应商状态未知时返回 unknown，不自动发起无限重试。


## poster_compose

输入 `{ heroAssetId, copyArtifactId, templateId, templateVersion }`。

宿主检查当前项目引用关系和主图依赖哈希；允许显式复用旧版本的有效主图。文字必须进行测量、换行、溢出检查；必须包含 disclosure。

返回真实海报 assetId 和元信息。海报合成不调用生图模型，不改变主产品形态。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
