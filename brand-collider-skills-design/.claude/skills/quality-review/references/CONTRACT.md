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


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## read_asset

输入 `{ assetId }`。只读取当前任务允许的素材。支持视觉时返回图像内容及元信息；不支持时返回 capability_unavailable，不能以文本描述冒充读取实际图片。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
