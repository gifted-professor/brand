# 联名碰撞器产物与工具契约 · 1.0

本文所有类型都是本项目定义，不是 Agent Skills 标准或 SDK 自动实现的字段。实现时应为每个类型编写 JSON Schema 或 Zod，并让服务端验证。

本文的 `BrandProfileSet`、`ConceptSet`、`DesignSpec`、`CopyPack`、`RenderPlan` 与 `ReviewReport` 是完整业务产物契约。网页工作台采用独立的简化结构（包括下文 MaterialPlan/MaterialVisual），不能将工作台字段直接添加到这些 1.0 payload，也不能把计划保存视为真实图片制作完成。

## 开放品类适配方法的承载

六阶段按 [开放品类适配方法](../.claude/skills/brand-profile/references/CATEGORY_ADAPTATION.md) 衔接资料、能力、用户动作、核心产品解剖、资产转译、开放发散与适配复核。该方法不设行业白名单，不要求现有模板或实物；固定物料分类仅组织推导结果。

品类画像和适配依据属于既有内容：网页保存在现有研究/设计 section；完整路径在 BrandProfileSet.interpretations、ConceptSet 的产品/场景描述、DesignSpec 的产品/组件描述中延续，并由文案、视觉与检查引用。不得为此新增结构字段、ArtifactRecord 类型或自报保存状态。已知能力与探索提案分别标记；未知生产参数不阻塞概念，纯文案修订复用已确定依据。

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
- 档案应能定位双方多产品线与业务能力、用户动作和使用环境、资产与功能边界。品类画像和适配依据属于既有解释内容；已知能力保留事实来源，推导与探索提案写入 interpretations，未经确认的生产或服务条件留在 unknowns。

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
- 每个方向以双方共同创造的核心产品或体验及资产融合为核心，再按实际触点展开包装、传播及相关延伸；不要求虚拟 IP，数字、内容和服务不强制实物产品。十二进三是概念方案数量，不是物料上限；丰富候选规划按下文共用方法保存，不冒充新 ConceptSet 字段或已完成图片。

## DesignSpec

- `conceptId`：必须与服务端已选择方向一致。
- `product`：`{ name, category, description }`。
- `components[]`：每项 `{ id, name, kind, requiresNewItem, requiresNewPrinting, resourceIds, description }`。
- `kind` 首版使用 `cup | sleeve | gift-box | bag | digital | other`；other 仍需语义检查，不能用来躲避礼盒规则。
- `kind` 是兼容枚举，不是品类白名单或创意模板。未单列的实体品类可用 `other`，数字产物适用 `digital`，在名称和描述中写明主体与适配依据，不擅自扩充枚举。`product.category` 为自由文本；网页 MaterialPlan 的 category 与组件 kind 不是同一字段。
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
- 物料候选中的可选项不代表已承诺售卖或赠送。逐件文案沿用真实物料 ID 和本轮范围，未确认的参数、材质、工艺、配方、功效、认证或服务范围不能成为宣传卖点。

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

用户要求丰富物料规划或方向确定后整套制作时，在既有 DesignSpec、CopyPack、RenderPlan 与 ReviewReport 之外保存任务附件，统一引用当前概念、设计版本和真实内容哈希。详细字段与分工见 [整套制作方法](../.claude/skills/visual-production/references/CAMPAIGN_KIT.md)。附件和网页的结构化物料候选没有注册新的完整 ArtifactRecord 类型，也不等于实现批量生图、完整制作编排或真实产物导出。

- 产品与视觉设定：核心产品或体验锚点、双方资产到风味/造型/材质/工艺/功能/内容/服务体验的具体融合，以及双方辨识度、配色、字体和核心不变量；涉及 IP 时再固定角色版本。外观、风味、工艺或功能型联名使用匹配的主题说明；剧情型方案再展开动因、角色关系与完整情节。
- 物料清单：依开放品类适配方法从用户旅程和具体作用推导候选，再按物料分类和核心/推荐/可选组织结果，不要求每类齐全。允许核心深化、邻近延伸和探索提案，以实际用途、输入范围和有效条件决定规模，区分已知能力与提案；同一物品换角色、配色、画幅或视角记为 variants。
- 逐件设计：记录核心产品解剖、可改变部位、需保留功能及资产转译，纳入制作的产物先交独立效果与对应内容；非实物交付相应内容或体验表达。未知生产参数不阻塞概念，效果图不证明可生产或已上线；尺寸、刀版、工艺与履约验证在进入对应范围后补。
- 视频筹备：脚本、分镜、旁白、镜头所需角色/道具/空间与关键帧，区分真实素材、示意图、待制素材和实际成片。视频 Prompt 不能替代素材或视频文件。
- 交付与检查：一次性交付的是共用设定驱动的一套相互一致的产物；各件可在内部依赖顺序中分别生成。局部修订只使受影响的下游产物失效，不把无关素材重做。

## 网页工作台 MaterialPlan / MaterialVisual（简化结构）

字段定义见 `src/material-plan.ts`，使用于网页 `design-b` 与 `visual-b`，不走上述完整产物 payload 的字段扩展。

- `MaterialPlan.productAnchor`：`{ brandId: "a" | "b" | "both", category, coreProduct, rationale, ipAssets: string[], translation }`。`brandId` 表示任一方承载或双方共同提供，`category` 为自由文本品类，`coreProduct` 可描述核心产品、内容、服务或体验。`ipAssets` 为兼容保留旧名，指双方合作资产，不限定 IP。
- `MaterialPlan.deliveryScope?`：`full_collaboration | focused_deliverables`。存储字段可选，旧记录缺省按 `full_collaboration` 解释，读取或保存旧对象不自动补写该字段；新生成请求的 schema 必须明确范围。它只扩展网页 MaterialPlan，不扩展完整业务 Artifact。
- `MaterialPlan.scopeNote`：范围、创意假设与候选数量取舍；`focused_deliverables` 必须说明用户明确限定的本轮交付和复用的既有核心设计依据。
- `MaterialPlan.items[]`：`{ id, name, category, priority, role, design, ipExpression, dependencies: string[], variants: string[], feasibility }`。
- `category` 为 `product | packaging | communication | merchandise | experience`，分别表示核心产品（含数字产品和内容）、包装与随附、传播物料、延伸周边、场景与体验（含服务）。`full_collaboration` 至少有一项 `priority: core` 且 `category` 为 `product` 或 `experience`；`focused_deliverables` 仅用于用户明确限制本轮交付、核心已有设计依据的任务，可只列本轮所需产物，不为校验添加虚假核心项。两种范围均不强制实体 SKU。
- `priority` 为 `core | recommended | optional`，表示制作建议，不表示用户已选定、已生成或可量产。
- 物料 `id` 稳定且唯一；`dependencies` 只引用同一计划内的物料 ID，不得自引用或循环；`role`、`design`、`ipExpression`、`feasibility` 分别写用途、具体设计、双方资产融合和执行条件。`ipExpression` 保留旧字段名以兼容存储，融合可以来自审美、工艺、原料配方、技术、功能、内容、渠道服务或 IP。变体不拆成额外候选。
- `MaterialVisual`：`{ materialId, prompt }`。`visual-b` 的逐件提示词与当前清单 ID 一一对应，并另保留主视觉 `imagePrompt`；逐件内容必须表现对应设计，不能复制总览提示词冒充完整制作计划。

计划与提示词完成不触发批量真实生图。候选数量、实际制作物料数量、文件数量和变体数量分别统计；真实生成与检查状态只能来自实际工具与文件证据。

deliveryScope 修复网页计划的范围校验，不改变完整业务契约或全新任务的固定三个方向路由；不能据此宣称新窄任务已跳过该路由。已有纯文案修订继续复用当前流程、清单和适配依据，不要求重建计划。品类画像仍使用原研究/设计 section。

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
