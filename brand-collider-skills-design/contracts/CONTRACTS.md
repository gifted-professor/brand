# 联名碰撞器产物与工具契约 · 1.0

本文所有类型都是本项目定义，不是 Agent Skills 标准或 SDK 自动实现的字段。实现时应为每个类型编写 JSON Schema 或 Zod，并让服务端验证。

## 公共提交协议

逻辑工具：submit_artifact。默认 SDK 映射为 mcp__collider__submit_artifact。

输入：`{ type, schemaVersion: "1.0", baseRevision, parentRefs, payload }`。

`parentRefs` 为 `{ artifactId, contentHash }[]`。项目身份、任务 ID、生产 Skill 信息从宿主上下文读取，不接受模型覆盖。

成功：`{ artifactId, contentHash, revision, validation: { structural, ruleFindings } }`。

失败：`{ error: { code, message, fieldErrors, retryable } }`；不得返回虚假保存结果。

ArtifactRecord 的 ID、时间、版本、哈希由后端生成。以下描述的都是 payload。

## BrandProfileSet

- `brands[]`：恰好两个，brandId 与输入一致。
- 每项包含 `brandId`、`name`、`facts[]`、`interpretations[]`、`resources[]`、`unknowns[]`。
- facts 项：`{ text, inputClaimIds }`，每个 claim ID 必须存在于相应品牌输入。
- interpretations 项：`{ text, basedOnClaimIds }`，不得混为已核实事实。
- resources 项：保留输入资源的 `id`、`label`、`status`、`description`，不能新增确认状态。
- unknowns：字符串数组。

## ConceptSet

- `concepts[]`：内部默认十二个候选经过评审与成熟化后，提交一至三个合格方案；三是上限，不是凑数要求。零个合格时返回具体阻断原因。
- 每项：`id`、`title`、`productIdea`、`consumerValue`、`scenario`、`differentiator`。
- `brandContributions[]`：恰好两个 `{ brandId, contribution, valueToBrand }`。
- `constraintNotes[]`：`{ constraintId, note }`。
- `dialogue[]`：`{ speaker: "brand-a" | "brand-b" | "director", line }`，三到五条简短 AI 模拟话语。
- `assumptions[]`、`pendingConfirmations[]`：保留创意假设和待确认条件。
- `productIdea` 与 `scenario` 必须足以说明成品组成与消费者完整过程；`consumerValue` 说明目标作用路径；`differentiator` 同时说明与其余入围方案及相似案例的差异。
- 随任务附件提供真实候选池、逐项淘汰／入围依据，以及各入围方案的最小执行、经济逻辑、视觉场景和验证方式；引用宿主实际支持的附件，不编造新增产物 ID。
- 少于三个合格方案不构成失败；不得通过相似方案补位。旧宿主若仍只接受恰好三个，保留真实结果并报告兼容缺口，不能伪造达标。

## DesignSpec

- `conceptId`：必须与服务端已选择方向一致。
- `product`：`{ name, category, description }`。
- `components[]`：每项 `{ id, name, kind, requiresNewItem, requiresNewPrinting, resourceIds, description }`。
- `kind` 首版使用 `cup | sleeve | gift-box | bag | digital | other`；other 仍需语义检查，不能用来躲避礼盒规则。
- 两个 requires 字段使用 `yes | no | unknown`，不能用布尔值隐藏未知。
- `brandRoles[]`：`{ brandId, contribution }`。
- `visual`：`{ palette: string[], materials: string[], motifs: string[], composition: string, avoid: string[] }`。
- `constraintsSnapshot`：完整复制有效 brief 中的 constraints，宿主比对，不允许模型删改。
- `decisions[]`：`{ constraintId, decision }`。
- `assumptions[]`、`pendingConfirmations[]`：字符串数组。

## CopyPack

- `designRef`：`{ artifactId, contentHash }`，必须为当前采用的设计。
- `title`、`slogan`、`story`、`posterTitle`、`posterSubtitle`、`socialCaption`。
- `disclosure`：固定为 `AI 概念设计 · 非官方联名`。
- 不得增加设计中没有的产品、赠品、价格、授权或日期。

## RenderPlan

- `designRef`：当前设计 ID 和哈希。
- `stylePackRef`：`{ id, version }`。
- `hero`：`{ prompt, negativePrompt, referenceAssetIds }`。
- `poster`：`{ templateId, templateVersion, copyRef, imageSource: "reuse_hero" }`。
- 服务端验证引用、模型能力、限额；不能仅凭 Agent 填字段就视为方案通过。
- 只改海报时允许沿用原主图的渲染计划引用；不得因为重新提交 RenderPlan 就默认生图。

## ReviewReport

- `stage`：`pre_render | post_render`。
- `targets`：正在检查的产物或素材 `{ artifactId, contentHash }[]`。素材也使用同一引用字段，必须存在于素材记录中。
- `verdict`：`pass | needs_revision | needs_input | unverified`。
- `findings[]`：`{ severity: "block" | "warn" | "info", constraintId: string | null, message, evidenceRefs: string[], proposedFix }`。
- `visualInspection`：`not_required | performed | unavailable`。
- `limitations[]`：字符串数组。
- post_render 没有真实图片读取证据时，visualInspection 为 unavailable，verdict 不得为 pass。
- Agent 报告不是宿主授权或人工签核。宿主合并代码规则与真实工具执行证据后决定状态。

## 整套联名制作附件（方法扩展）

用户要求方案锁定后整套制作时，在既有 DesignSpec、CopyPack、RenderPlan 与 ReviewReport 之外保存任务附件，统一引用当前概念、设计版本和真实内容哈希。详细字段与分工见 [整套制作方法](../.claude/skills/visual-production/references/CAMPAIGN_KIT.md)。此扩展没有注册新工具或产物类型，当前网页尚需实现附件编排与逐件产物展示。

- 故事与视觉设定：主题、叙事动因、角色关系、情节推进与收束，以及配色、字体、角色/产品不变量。
- 物料清单：按真实物料家族划分，记录用途、设计面、尺寸变体、精确文案、素材依赖、制作方式、文件和状态；总览图及其尺寸不算新增实物家族。
- 逐件设计：效果探索先交杯托、饮品、折页、海报等独立效果图和对应内容；尺寸、刀版与完整印刷面规格在用户进入打样/生产阶段后再补。结构稿可留附录，不能代替当前效果图；效果图也不等于可生产刀版。
- 视频筹备：脚本、分镜、旁白、镜头所需角色/道具/空间与关键帧，区分真实素材、示意图、待制素材和实际成片。视频 Prompt 不能替代素材或视频文件。
- 交付与检查：一次性交付的是共用设定驱动的一套相互一致的产物；各件可在内部依赖顺序中分别生成。局部修订只使受影响的下游产物失效，不把无关素材重做。

## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。

## read_asset

输入 `{ assetId }`。只读取当前任务允许的素材。支持视觉时返回图像内容及元信息；不支持时返回 capability_unavailable，不能以文本描述冒充读取实际图片。

## image_generate

实现进度：底层 `ImageProvider`、配置和本地素材保存已在 `src/providers/` 实现，见 [API 接入说明](../docs/IMAGE_API.md)。下面的受控工具注册及业务守卫尚未实现；CLI 是开发入口，不能直接充当对外工具路由。

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
