# quality-review：局部契约参考

版本：1.0。以下工具和字段是项目约定，需要后端实现。

## 公共提交协议

逻辑工具：submit_artifact。默认 SDK 映射为 mcp__collider__submit_artifact。

输入：`{ type, schemaVersion: "1.0", baseRevision, parentRefs, payload }`。

`parentRefs` 为 `{ artifactId, contentHash }[]`。项目身份、任务 ID、生产 Skill 信息从宿主上下文读取，不接受模型覆盖。

成功：`{ artifactId, contentHash, revision, validation: { structural, ruleFindings } }`。

失败：`{ error: { code, message, fieldErrors, retryable } }`；不得返回虚假保存结果。

ArtifactRecord 的 ID、时间、版本、哈希由后端生成。以下描述的都是 payload。


## ReviewReport

- `stage`：`pre_render | post_render`。
- `targets`：正在检查的产物或素材 `{ artifactId, contentHash }[]`。素材也使用同一引用字段，必须存在于素材记录中。
- `verdict`：`pass | needs_revision | needs_input | unverified`。
- `findings[]`：`{ severity: "block" | "warn" | "info", constraintId: string | null, message, evidenceRefs: string[], proposedFix }`。
- `visualInspection`：`not_required | performed | unavailable`。
- `limitations[]`：字符串数组。
- post_render 没有真实图片读取证据时，visualInspection 为 unavailable，verdict 不得为 pass。
- Agent 报告不是宿主授权或人工签核。宿主合并代码规则与真实工具执行证据后决定状态。

资料稀少或执行条件未知不单独产生 block/needs_input。品牌名与明确假设支持的文字概念仍按其交付范围评审，使用 warn/info 和 limitations 记录预算、商业批准与供应能力待确认。准确身份图缺官方/已批准依据、必需附图或视觉查看证据时，该项须以具体 finding 标记未就绪/未验证，不能因称作“概念”而通过；普通原创抽象设计及用户明确接受的原创替代按实际范围验收。虚构已知事实、实际设计矛盾和真实产物缺失仍须准确报告，proposedFix 给出补采、修复和可继续独立项。post_render 缺少实际读取证据的 unverified 规则继续生效，不能为全流程完成伪造视觉检查或真实产物。

## 物料计划与交付检查

依 [整套物料交付约定](../../visual-production/references/CAMPAIGN_KIT.md) 分别检查：核心设计依据与双方资产融合、候选分层及独立用途、清单 ID 和依赖、当前范围实际文件及读取证据。先核对 MaterialPlan.deliveryScope：full_collaboration（含字段缺省的旧记录）必须含 product 或 experience 类的 core；focused_deliverables 必须有用户明确限定本轮交付的依据，scopeNote 说明复用的既有核心设计，可只交本轮所需产物，不要求新增核心项。新生成请求须明确范围，不能把整套任务改成 focused_deliverables 以躲避检查，也不自动给旧保存对象补字段。数量由独立用途、输入范围与有效条件决定，固定分类不作为生成起点，不强加周边或拆分变体。

网页 MaterialPlan 和 MaterialVisual[] 不是新增 ReviewReport 阶段，也不是实际图片。逐件提示词需与当前物料 ID 一一对应；分别汇报候选数量、实际制作物料数量、文件与变体数量，未纳入制作的可选项不算生成失败。没有实际图片读取证据，仍执行上述 unverified 规则。

本项目 autoProduce 路径另有宿主保存的真实逐件附图、文件和视觉检查状态。第 8 步的图像审查实际附上参考与生成结果，第 9 步汇总这些证据和本轮覆盖；总结调用不能仅凭计划宣称亲自看图。缺失、unknown、待修和无视觉证据的项保持具体状态，不能因文字阶段完成而提升为整包通过。此状态属于网页宿主，不新增 ReviewReport.stage 或 verdict。



## 开放品类适配衔接

依 [开放品类适配方法](../../brand-profile/references/CATEGORY_ADAPTATION.md) 执行本阶段职责：复核资料、品类画像、用户动作、产品解剖、资产转译与最终产物是否对应，并检查去重、品牌替换和适配结论；不同品类按自身功能与场景验收。完整业务路径读取上游已有画像及适配依据，在 findings 的 message、evidenceRefs 和 proposedFix 中记录适配问题、来源与修复，不新增研究字段。网页路径复用既有研究/设计 section 保存适配说明；不新增 payload 字段或 ArtifactRecord 类型。物料分类仅组织结果，不是创意生成起点；缺少模板不构成失败，探索提案与已知能力分别标记。


## 真实视觉依据衔接

依 [真实品牌素材与逐件附图依据](../../brand-profile/references/VISUAL_EVIDENCE.md) 执行：出图前复核身份来源、已查看文件和必要附图能力；出图后逐件核对实际附图证据并对照原参考验收身份，缺证据不得宣称真实性通过。详细来源清单、参考映射和调用证据使用宿主已有研究 section、来源字段或实际支持的附件保存，不新增本契约 payload、ArtifactRecord 类型或 MCP 参数。准确身份素材缺口仅暂停依赖它的图像项，文字与独立项继续；不自动以原创替身绕过。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## read_asset

输入 `{ assetId }`。只读取当前任务允许的素材。支持视觉时返回图像内容及元信息；不支持时返回 capability_unavailable，不能以文本描述冒充读取实际图片。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
