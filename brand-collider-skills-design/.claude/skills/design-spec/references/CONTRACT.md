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
- 两个 requires 字段使用 `yes | no | unknown`，不能用布尔值隐藏未知。
- `brandRoles[]`：`{ brandId, contribution }`。
- `visual`：`{ palette: string[], materials: string[], motifs: string[], composition: string, avoid: string[] }`。
- `constraintsSnapshot`：完整复制有效 brief 中的 constraints，宿主比对，不允许模型删改。
- `decisions[]`：`{ constraintId, decision }`。
- `assumptions[]`、`pendingConfirmations[]`：字符串数组。


## get_context

无项目 ID 参数，身份绑定当前任务。返回任务动作、brief、baseRevision、所选方向、有效产物、可用素材、stylePack、posterTemplate、限额和待处理事项。

可选返回 researchContext：上游案例库版本与内容哈希、检索问题、相关案例、逐条证据状态和来源。它是任务研究附件，不是业务产物或授权。案例事实进入 BrandProfileSet 前仍须对应当前 brief.claims；历史资源和公开图片不得自动成为 resourceId 或 assetId。缺少此字段时保持原有行为。

首次品牌资料已完备时可以复用有效 BrandProfileSet，不重复分析。


## 全局规则

数据文件和 Skill 参考文件分开。Agent 不能自报资源真实可用、修改项目所有者、重设版本、跳过限额、提升权限或伪造审核完成。

对外下载主图时也应应用概念标记；可在内部保留干净主图供排版，但不要把内部素材直接当作已披露的公开成品。
