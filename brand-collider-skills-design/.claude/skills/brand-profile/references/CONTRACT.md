# brand-profile：局部契约参考

版本：1.0。以下工具和字段是项目约定，需要后端实现。

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
- 在这些既有字段内整理主营品类、当前核心产品或服务及双方的审美、工艺、原料配方、技术、功能、内容、渠道服务或 IP 资产：有依据的内容写入 facts，转译与扩展建议写入 interpretations，具体 SKU、材质工艺、配方、性能和服务范围缺少依据时保留 unknowns。不要为品牌锚点另造完整 payload 字段。

资料稀少不改变字段或触发 needs_input。facts 只保留符合 claim 引用规则的内容；公开研究尚未进入 brief.claims 时，将来源、日期与未核验状态写入 interpretations.text 或宿主支持的研究附件，不能伪造 claim ID。工作定位、消费者场景与资产转译假设也写入 interpretations，并与已核实事实区分；没有可引用 claim 时保留空的 basedOnClaimIds。resources 允许没有已知资源，不为通过提交制造资源。unknowns 记录落地待确认项，画像仍须给出可让下游继续创作的工作依据。网页路径使用宿主提供的研究 section 和来源字段，不把本契约字段塞入网页响应。

## 物料规划衔接

下游按 [整套物料交付约定](../../visual-production/references/CAMPAIGN_KIT.md) 从核心产品或体验及实际接触点展开丰富候选。网页 MaterialPlan 是独立的简化工作台结构，不是 BrandProfileSet 的新字段；产品、服务与双方资产事实仍受本文来源规则约束。


## 开放品类适配衔接

依 [开放品类适配方法](CATEGORY_ADAPTATION.md) 执行本阶段职责：整理多产品线与业务能力、用户动作和环境，建立有来源的品类画像及功能边界；区分已知能力、推导和探索提案，为下游保留适配依据。完整业务路径把有来源的能力事实写入 facts，把品类画像及推导依据写入 interpretations，未知项写入 unknowns；继续遵守 claim 引用规则。网页路径复用既有研究/设计 section 保存适配说明；不新增 payload 字段或 ArtifactRecord 类型。物料分类仅组织结果，不是创意生成起点；缺少模板不构成失败，探索提案与已知能力分别标记。


## 真实视觉依据衔接

依 [真实品牌素材与逐件附图依据](VISUAL_EVIDENCE.md) 执行：研究开始时即并行采集双方真实网页图片，保存来源、实际文件与查看记录；事实进入 facts 仍须符合当前 claim 引用规则。详细来源清单、参考映射和调用证据使用宿主已有研究 section、来源字段或实际支持的附件保存，不新增本契约 payload、ArtifactRecord 类型或 MCP 参数。准确身份素材缺口仅暂停依赖它的图像项，文字与独立项继续；不自动以原创替身绕过。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
