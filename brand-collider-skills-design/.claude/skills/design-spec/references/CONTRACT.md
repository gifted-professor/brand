# design-spec：局部契约参考

版本：1.0。以下工具和字段是项目约定，需要后端实现。

## 公共提交协议

逻辑工具：submit_artifact。默认 SDK 映射为 mcp__collider__submit_artifact。

输入：`{ type, schemaVersion: "1.0", baseRevision, parentRefs, payload }`。

`parentRefs` 为 `{ artifactId, contentHash }[]`。项目身份、任务 ID、生产 Skill 信息从宿主上下文读取，不接受模型覆盖。

成功：`{ artifactId, contentHash, revision, validation: { structural, ruleFindings } }`。

失败：`{ error: { code, message, fieldErrors, retryable } }`；不得返回虚假保存结果。

ArtifactRecord 的 ID、时间、版本、哈希由后端生成。以下描述的都是 payload。


## DesignSpec

- `conceptId`：必须与服务端已选择方向一致。
- `product`：`{ name, category, description }`。
- `components[]`：每项 `{ id, name, kind, requiresNewItem, requiresNewPrinting, resourceIds, description }`。
- `kind` 首版使用 `cup | sleeve | gift-box | bag | digital | other`；other 仍需语义检查，不能用来躲避礼盒规则。
- 这是兼容枚举，不是品类白名单或创意起点。未单列的实体品类可按语义使用 other，数字产物适用 digital，在名称和描述中写清真实产品或体验身份及适配依据；product.category 继续为自由文本，不自行扩充完整 payload 枚举。
- 两个 requires 字段使用 `yes | no | unknown`，不能用布尔值隐藏未知。
- `brandRoles[]`：`{ brandId, contribution }`。
- `visual`：`{ palette: string[], materials: string[], motifs: string[], composition: string, avoid: string[] }`。
- `constraintsSnapshot`：完整复制有效 brief 中的 constraints，宿主比对，不允许模型删改。
- `decisions[]`：`{ constraintId, decision }`。
- `assumptions[]`、`pendingConfirmations[]`：字符串数组。

当前条件与资源允许不完整，设计仍应提交可制作概念效果的完整描述。缺少实物资源时可设计新增概念组件，resourceIds 留空，requires 字段如实填写；不得编造现有资源 ID。assumptions 保留采用的产品形态、规模与资源替代，pendingConfirmations 保留真实授权、预算和生产依赖。条件冲突写入 decisions，给出采用的替代方案与未满足项，保留 constraintsSnapshot 原值。服务端采用方向可以来自用户全流程请求下的主控代选，不把它写成品牌方批准。

## 网页简化设计与完整 DesignSpec 分开

网页 design-b 使用 MaterialPlan，包含 productAnchor、scopeNote、items 和可选存储字段 deliveryScope（full_collaboration | focused_deliverables）；新生成请求 schema 要求明确范围，旧记录缺省按 full_collaboration 解释且旧保存对象不自动补字段。逐项记录分类、核心/推荐/可选优先级、用途、设计、合作资产表达、物料依赖、变体与执行条件。字段与方法见 [整套物料交付约定](../../visual-production/references/CAMPAIGN_KIT.md) 及 `src/material-plan.ts`。

MaterialPlan 不是上述完整 DesignSpec 的新字段，也不是新增 ArtifactRecord 类型。productAnchor.brandId 支持 a、b 或 both；ipAssets 和 ipExpression 为存储兼容保留字段名，分别指合作资产及融合表达，不限定 IP。full_collaboration 至少一项 core 应归为 product 或 experience；focused_deliverables 仅用于用户明确限定本轮交付、核心已有设计依据的任务，由 productAnchor 与 scopeNote 保留该依据，items 只列本轮所需项，不为校验新增虚假核心。候选由使用旅程推导，以独立用途、输入范围和有效条件决定数量；分类只组织结果，不强加实物或靠变体凑数。


## 开放品类适配衔接

依 [开放品类适配方法](../../brand-profile/references/CATEGORY_ADAPTATION.md) 执行本阶段职责：承接已确定的适配依据，落实核心产品解剖、可改变部位与需保留功能，将双方资产绑定具体部位或体验，并把旅程触点转成逐件设计。完整业务路径复用上游画像，把产品解剖、功能边界和转译依据写入 product.description、components[].description、brandRoles 及相关假设描述。网页路径复用既有研究/设计 section 保存适配说明；不新增 payload 字段或 ArtifactRecord 类型。物料分类仅组织结果，不是创意生成起点；缺少模板不构成失败，探索提案与已知能力分别标记。


## 真实视觉依据衔接

依 [真实品牌素材与逐件附图依据](../../brand-profile/references/VISUAL_EVIDENCE.md) 执行：方向确定时补齐采用版本并冻结每个 materialId 的参考映射、文件哈希、用途及身份约束；设计变化只更新受影响依赖。详细来源清单、参考映射和调用证据使用宿主已有研究 section、来源字段或实际支持的附件保存，不新增本契约 payload、ArtifactRecord 类型或 MCP 参数。准确身份素材缺口仅暂停依赖它的图像项，文字与独立项继续；不自动以原创替身绕过。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
