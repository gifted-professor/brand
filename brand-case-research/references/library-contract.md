# 案例库契约 1.0

机器结构见 [library.schema.json](library.schema.json)，附带脚本同时检查跨记录引用与事实升级条件。

## 文件与来源

`library.json` 包含 `schemaVersion`、递增 `revision`、`updatedAt`、`sources`、`cases`、`methods`、`conflicts`。

来源记录包含 `id`、`kind`、`path`、`url`、`sha256`、`lineageGroup`、`status`。本地 `path` 相对库所在目录；网页用绝对 URL。本地原件保留字节哈希，网页没有原始快照时不编造哈希。`registered` 是登记了线索，`read` 才表示实际读取过。来源已读取仍不等于其内容属实。

`kind` 使用 `ai_report | structured_dataset | workbook | web_primary | web_secondary`。来自同一研究报告的工作簿、JSON、CSV、复制件共享来源家族。两个报告的核验若追溯到同一公司稿件，亦不当作两份独立佐证。

引用为 `{sourceId, locator}`。定位示例：JSON Pointer `/0/公开结果（事实）`；工作簿 `合作评分卡!A6:B17`；报告 `lines:10-20`；单行长文 `chars:120-260`（Unicode 字符，0 起点，半开区间）；网页为小标题和对应段落的可重找描述。不要只写“见报告”。

## 案例与断言

案例字段：

| 字段 | 含义 |
|---|---|
| `id/title` | 稳定 ID 和项目名称；原标题/别名可在 sourceLabels 保存 |
| `participants[]` | 各方 name、contribution、benefit、economics，未知保留 null |
| `timeframe/market/collaborationType` | 时间、市场和合作模式；不能把一般赞助、IP 授权、集团内协作都称为同一种联名 |
| `deliverables[]` | 产物线索，真实性以对应 event 断言为准 |
| `sourceRefs/candidateUrls` | 导入依据及外部链接线索；是否已读以 sources 和 sourceReadings 为准 |
| `sourceReadings`（可选） | 已读外部页面的 `sourceId/checkedAt/supportedScope/limitations/claimReview`；记录页面能够支持的范围，不替代 claims 的逐条核验记录 |
| `sourceAudits`（可选） | 补充引文的 `sourceId/auditId/accessStatus/checkedAt/supportedScope/limitations/assessment`；`partial` 可能只读到摘要、节目说明或索引，不能自动加入全文 sourceReadings 或作为决定性断言核验 |
| `claims[]` | 逐条可核验的事件、结果，以及明确归属的解释/建议 |
| `insights` | 机制、风险、缺失证据的研究摘要；不是当前项目硬条件 |
| `tags` | 便于按场景、机制、产物、风险搜索的关键词 |
| `sourceLabels` | 原报告分类、等级、原核验日期、原记录；不参与自动升级 |
| `metrics/timeline` | 逐项指标与有时间界限的事件，不确定时留空 |

每个 claim 含 `id/text/type/status/sourceRefs/verification`。`type` 是 `event | outcome | interpretation | recommendation`。分析与建议即使合理也不能改成事实。

核验记录：`{sourceId, locator, checkedAt, conclusion, notes}`，conclusion 为 `supports | contradicts | inconclusive`。`notes` 说明支持范围、披露方和局限。事件/结果的 `supported` 至少要求一条实际已读网页来源的支持记录；内部用户证明可保存为输入资料，需另外扩展来源类型与验证逻辑，不能伪装成网页。

矛盾主张分别保留。只有范围一致的支持与反证冲突才叫事实争议；不同年份、零售与出货口径不同，不自动判同一事实被推翻。`conflicts` 保存 `id`、关联案例/断言、议题、两边说法、待补证和处理状态；不要伪造裁决。

可选指标建议形状：`{name,value,unit,market,period,denominator,claimId,sourceRefs}`。金额包含币种；`null` 不等于 0。事件建议形状：`{date,datePrecision,event,claimIds}`。核验日期不替代事件日期。

## 方法与历史更新

`methods` 保存来源明确的维度、评分卡或分析框架，每项带唯一 `id`、适用范围、来源、建议参数及局限；不作为 API 权限或质量关口。历史案例不要求机械填满 20 维。

增量维护时先按来源哈希去重，再按项目匹配；保留旧 claim ID 和历史事件。事实有新证据时追加 verification，更新受影响状态和 revision。检索包引用整库内容哈希及案例哈希，可据此识别版本过期；案例哈希不是原创作系统 artifactId。
