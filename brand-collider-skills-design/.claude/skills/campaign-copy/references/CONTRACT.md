# campaign-copy：局部契约参考

版本：1.0。以下工具和字段是项目约定，需要后端实现。

## 公共提交协议

逻辑工具：submit_artifact。默认 SDK 映射为 mcp__collider__submit_artifact。

输入：`{ type, schemaVersion: "1.0", baseRevision, parentRefs, payload }`。

`parentRefs` 为 `{ artifactId, contentHash }[]`。项目身份、任务 ID、生产 Skill 信息从宿主上下文读取，不接受模型覆盖。

成功：`{ artifactId, contentHash, revision, validation: { structural, ruleFindings } }`。

失败：`{ error: { code, message, fieldErrors, retryable } }`；不得返回虚假保存结果。

ArtifactRecord 的 ID、时间、版本、哈希由后端生成。以下描述的都是 payload。


## CopyPack

- `designRef`：`{ artifactId, contentHash }`，必须为当前采用的设计。
- `title`、`slogan`、`story`、`posterTitle`、`posterSubtitle`、`socialCaption`。
- `disclosure`：固定为 `AI 概念设计 · 非官方联名`。
- 不得增加设计中没有的产品、赠品、价格、授权或日期。
- 候选中的可选项不表示已承诺赠送或售卖。各物料使用本轮范围和对应 ID 的文案；未经确认的配方、3C 参数、首饰材质成分与工艺、功效、认证或服务范围不能写成真实卖点。

工作假设支持的概念设计可以完成全部 CopyPack 字段；资料稀少不返回 needs_input。以当前设计的消费者价值形成标题、故事和逐件表达，未知价格、日期和执行权益可省略，在已有制作说明或研究附件保留落地待确认项。不得以空白、反复“待补资料”或官方合作承诺替代概念文案，不新增工具字段。

## 逐件文案衔接

依 [整套物料交付约定](../../visual-production/references/CAMPAIGN_KIT.md) 绑定实际产物计划和双方资产融合，不要求虚拟 IP。外观、风味、工艺或功能型联名可使用简明主题说明，剧情方案才展开完整故事；数字、内容、服务直接写对应产物与体验文案，不强加实物赠品。网页 MaterialPlan 与逐件文案附件不能作为 CopyPack 的新增 payload 字段，文案齐全也不等于物料已生成。


## 开放品类适配衔接

依 [开放品类适配方法](../../brand-profile/references/CATEGORY_ADAPTATION.md) 执行本阶段职责：复用当前品类画像与适配依据，按用户动作、使用环境和具体触点写消费者可理解的表达。纯文案修订不重跑品牌研究或品类推导。完整业务路径复用上游研究/设计中的画像和适配依据，在既有文案字段表达相应消费者价值；不新增研究字段，纯文案修订不改已确定依据。网页路径复用既有研究/设计 section 保存适配说明；不新增 payload 字段或 ArtifactRecord 类型。物料分类仅组织结果，不是创意生成起点；缺少模板不构成失败，探索提案与已知能力分别标记。


## 真实视觉依据衔接

依 [真实品牌素材与逐件附图依据](../../brand-profile/references/VISUAL_EVIDENCE.md) 执行：沿用已核实的角色、产品名称与版本，将官方设定和本次原创故事区分；纯文案修订复用现有依据。详细来源清单、参考映射和调用证据使用宿主已有研究 section、来源字段或实际支持的附件保存，不新增本契约 payload、ArtifactRecord 类型或 MCP 参数。准确身份素材缺口仅暂停依赖它的图像项，文字与独立项继续；不自动以原创替身绕过。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
