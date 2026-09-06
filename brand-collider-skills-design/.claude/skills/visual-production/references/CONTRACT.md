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

## 网页逐件提示词与真实制作

网页 visual-b 根据当前 MaterialPlan 输出 MaterialVisual[]，每项 `{ materialId, prompt }` 与 items[].id 一一对应，并另保留总览 imagePrompt。详情见 [整套物料交付约定](CAMPAIGN_KIT.md)。这是简化工作台数据，不是 RenderPlan 或 image_generate 的新增字段，不表示已有批量物料 MCP。

物料候选、逐件提示词和总览本身不授权真实生图。本项目网页显式记录 autoProduce: true 时，由宿主在 visual-b 提交后继续真实参考绑定、出图前检查、core 与 recommended 的最多四并发制作及逐件 CLI 看图；optional 保留候选，历史未带标志或为 false 时保持单图入口。该自动链路不扩展本契约 payload 或新增 MCP。生成以核心产品或体验及本轮实际范围为准；合作资产不限 IP，数字、内容、服务不强制实物或包装。每件必须有对应设计与真实制作证据，变体不计为新物料，提示词不能算效果图。


MaterialPlan.deliveryScope 为 focused_deliverables 时，须以用户明确的限定范围及 scopeNote 中的既有设计依据制作，只为 items 内当前产物编写提示词，不额外生成核心产品；full_collaboration 及缺省旧记录仍按整套要求检查。此网页字段不扩展 RenderPlan，也不改变实际路由能力。

## 开放品类适配衔接

依 [开放品类适配方法](../../brand-profile/references/CATEGORY_ADAPTATION.md) 执行本阶段职责：把当前产品解剖、功能边界与资产转译落实为可见部位、使用状态和展示情境；依已确定的旅程与清单制作，不从固定物料分类重新发散。完整业务路径复用上游设计的画像和适配依据，在既有 hero.prompt/negativePrompt 中落实可见部位、使用状态与需保留功能，不新增研究字段。网页路径复用既有研究/设计 section 保存适配说明；不新增 payload 字段或 ArtifactRecord 类型。物料分类仅组织结果，不是创意生成起点；缺少模板不构成失败，探索提案与已知能力分别标记。


## 真实视觉依据衔接

依 [真实品牌素材与逐件附图依据](../../brand-profile/references/VISUAL_EVIDENCE.md) 执行：生成前核对当前映射、已取得且已查看的文件与必要附图能力；按真实接口传图，逐件保存实际调用附图与输出证据，并按 CAMPAIGN_KIT 执行最多 4 个在途任务。详细来源清单、参考映射和调用证据使用宿主已有研究 section、来源字段或实际支持的附件保存，不新增本契约 payload、ArtifactRecord 类型或 MCP 参数。准确身份素材缺口仅暂停依赖它的图像项，文字与独立项继续；不自动以原创替身绕过。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## read_asset

输入 `{ assetId }`。只读取当前任务允许的素材。支持视觉时返回图像内容及元信息；不支持时返回 capability_unavailable，不能以文本描述冒充读取实际图片。


## image_generate

输入 `{ designArtifactId, renderPlanArtifactId }`。不接受模型提供 endpoint、API key、输出目录或任意模型 ID。

宿主检查用户选择、当前版本、设计规则、有效 pre_render 报告和生成限额。prompt 必须与设计绑定；参考素材必须在当前授权范围内。

此处的授权指用户允许的制作范围和素材使用范围，不要求先取得品牌方商业批准才可生成概念图。无需准确身份来源的普通抽象设计或原创场景可以保留真实的空 referenceAssetIds；准确角色/符号/Logo/指定产品依赖缺参考时须补采，仍缺则暂停该项，不能以空数组和提示词中的品牌名绕过。实际参考只能填写已登记真实 ID，不得伪造参考、授权或像素一致性。全流程请求下由主控代选的方向须由宿主正常登记。

返回 `{ assetId, contentHash, generationStatus, reviewStatus, providerRequestId }`。reviewStatus 初始为 unverified。请求超时且供应商状态未知时返回 unknown，不自动发起无限重试。


## poster_compose

输入 `{ heroAssetId, copyArtifactId, templateId, templateVersion }`。

宿主检查当前项目引用关系和主图依赖哈希；允许显式复用旧版本的有效主图。文字必须进行测量、换行、溢出检查；必须包含 disclosure。

返回真实海报 assetId 和元信息。海报合成不调用生图模型，不改变主产品形态。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
