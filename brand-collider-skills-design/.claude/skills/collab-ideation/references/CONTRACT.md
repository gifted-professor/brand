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

- `concepts[]`：内部默认十二个候选经过评审与成熟化后，提交一至三个合格方案；三是上限，不是凑数要求。零个合格时返回具体阻断原因。
- 每项：`id`、`title`、`productIdea`、`consumerValue`、`scenario`、`differentiator`。
- `brandContributions[]`：恰好两个 `{ brandId, contribution, valueToBrand }`。
- `constraintNotes[]`：`{ constraintId, note }`。
- `dialogue[]`：`{ speaker: "brand-a" | "brand-b" | "director", line }`，三到五条简短 AI 模拟话语。
- `assumptions[]`、`pendingConfirmations[]`：保留创意假设和待确认条件。
- `productIdea` 与 `scenario` 必须足以说明成品组成与消费者完整过程；`consumerValue` 说明目标作用路径；`differentiator` 同时说明与其余入围方案及相似案例的差异。
- 随任务附件提供真实候选池、逐项淘汰／入围依据，以及各入围方案的最小执行、经济逻辑、视觉场景和验证方式；引用宿主实际支持的附件，不编造新增产物 ID。
- 少于三个合格方案不构成失败；不得通过相似方案补位。旧宿主若仍只接受恰好三个，保留真实结果并报告兼容缺口，不能伪造达标。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
