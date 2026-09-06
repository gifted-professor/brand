# collab-ideation：局部契约参考

版本：1.0。以下工具和字段是项目约定，需要后端实现。

## 公共提交协议

逻辑工具：submit_artifact。默认 SDK 映射为 mcp__collider__submit_artifact。

输入：`{ type, schemaVersion: "1.0", baseRevision, parentRefs, payload }`。

`parentRefs` 为 `{ artifactId, contentHash }[]`。项目身份、任务 ID、生产 Skill 信息从宿主上下文读取，不接受模型覆盖。

成功：`{ artifactId, contentHash, revision, validation: { structural, ruleFindings } }`。

失败：`{ error: { code, message, fieldErrors, retryable } }`；不得返回虚假保存结果。

ArtifactRecord 的 ID、时间、版本、哈希由后端生成。以下描述的都是 payload。


## ConceptSet

- `concepts[]`：内部默认十二个候选经过评审与成熟化后，提交一至三个成熟方案；三是上限，不是凑数要求。原候选均不成立时，形成满足关键目标的最小替代方向继续深化，并在 constraintNotes 中保留具体取舍，不把原候选伪称合格。
- 每项：`id`、`title`、`productIdea`、`consumerValue`、`scenario`、`differentiator`。
- `brandContributions[]`：恰好两个 `{ brandId, contribution, valueToBrand }`。
- `constraintNotes[]`：`{ constraintId, note }`。
- `dialogue[]`：`{ speaker: "brand-a" | "brand-b" | "director", line }`，三到五条简短 AI 模拟话语。
- `assumptions[]`、`pendingConfirmations[]`：保留创意假设和待确认条件。
- `productIdea` 与 `scenario` 必须足以说明成品组成与消费者完整过程；`consumerValue` 说明目标作用路径；`differentiator` 同时说明与其余入围方案及相似案例的差异。
- 随任务附件提供真实候选池、逐项淘汰／入围依据，以及各入围方案的最小执行、经济逻辑、视觉场景和验证方式；引用宿主实际支持的附件，不编造新增产物 ID。
- 少于三个合格方案不构成失败；不得通过相似方案补位。旧宿主若仍只接受恰好三个，保留真实结果并报告兼容缺口，不能伪造达标。

品牌名、简述及明确标记的工作画像足以启动概念。缺失预算、正式品牌素材、授权、供应链或渠道范围写入 assumptions/pendingConfirmations；constraintNotes 说明已知条件冲突与替代路径，不因此返回资料不足。用户已要求全流程时，主控记录采用方向及代选依据，继续下游；保持工具参数及宿主所需的选择状态，不伪造用户选择记录。

## 核心产物与物料候选

在 productIdea 与 scenario 内明确双方共同提供的核心产品或体验、各自品牌资产如何形成具体设计或功能，以及消费者所得。合作资产不限于 IP，可来自审美、工艺、原料配方、技术、功能、内容、渠道或服务；数字、内容、服务合作不强制实物产品。十二进三限制概念方向，不限制产物数量；由使用旅程推导候选后按核心/推荐/可选分层，以独立用途、用户范围、预算和有效条件确定规模。同一物品换角色或尺寸记为变体，不凑数。

详细方法见 [整套物料交付约定](../../visual-production/references/CAMPAIGN_KIT.md)。候选计划按宿主支持的附件或网页 MaterialPlan 保存；它不是 ConceptSet 新字段，也不证明已选定或实际生图。


## 开放品类适配衔接

依 [开放品类适配方法](../../brand-profile/references/CATEGORY_ADAPTATION.md) 执行本阶段职责：承接品类画像，从核心深化、邻近延伸和探索提案开放发散，将双方资产落实到产品部位或体验，再用使用旅程推导候选；以去重和品牌替换检验收敛。完整业务路径复用上游画像，在 productIdea、scenario、brandContributions 与 assumptions/pendingConfirmations 中说明本方案的适配、双方作用与提案边界。网页路径复用既有研究/设计 section 保存适配说明；不新增 payload 字段或 ArtifactRecord 类型。物料分类仅组织结果，不是创意生成起点；缺少模板不构成失败，探索提案与已知能力分别标记。


## 真实视觉依据衔接

依 [真实品牌素材与逐件附图依据](../../brand-profile/references/VISUAL_EVIDENCE.md) 执行：候选复用真实品牌特征，新增角色/产品版本需求立即交回并行补采；assumptions 不能把风格图或生成图提升为官方身份依据。详细来源清单、参考映射和调用证据使用宿主已有研究 section、来源字段或实际支持的附件保存，不新增本契约 payload、ArtifactRecord 类型或 MCP 参数。准确身份素材缺口仅暂停依赖它的图像项，文字与独立项继续；不自动以原创替身绕过。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
