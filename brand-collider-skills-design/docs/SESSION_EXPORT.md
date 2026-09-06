# 当前会话物料导出

现有网页 `/api/sessions/:id/export` 提供完整方案 Markdown；逐件真实图片与素材证据分别由 `/api/sessions/:id/media/materials/:materialId?v=N`、`references/:referenceId?v=N` 和 `evidence?v=N` 提供。图片接口校验登记的 SHA-256。需要脱离本地服务使用的整包时，使用离线脚本：

```bash
node scripts/export-session.ts --session session-UUID --out /absolute/new-package
```

从本项目目录运行，默认读取 `outputs/sessions`、`outputs/images` 及本会话 `outputs/grok-agents` / `outputs/cli-agents`。存储位置不同时，可显式传 `--outputs /absolute/outputs` 和 `--image-dir /absolute/images`。脚本不读取环境配置，不初始化运行时，不联网、不调用模型、不生图、不续跑，也不改写源会话。

先等当前任务与素材支线停止运行、会话与素材状态保存一致。运行中、版本不匹配或导出期间快照改变会拒绝导出。使用一个新的输出目录；现有目录、ZIP 和校验文件均不会覆盖。路径必须与宿主固定的登记结构相符，文件必须在指定存储根内，原件、产图和 CLI 附件均需匹配哈希并完整解码；符号链接、跨来源路径与哈希冲突会失败。

脚本输出目录、同名 `.zip` 和 `.zip.sha256`，并打印 `complete` / `partial`、实际已检查交付数量及缺口列表。`partial` 仍保存已有成果，但不能作为整套完成交付。真实文件缺失、未检查、失败、待修订和范围外物料分别保留，不拿提示词或占位文件代替。

包内包含：

- `README.md`、`manifest.json`：统一入口、当前版本、全部物料状态、相对路径、真实哈希、来源快照哈希和缺口。
- `materials/`：当前实际 PNG / JPEG / WebP，包括待修图片并明确其状态；`productionKind` 区分模型生图与已登记的本地后期。
- `proposal.md`、`copy.md`、`material-plan.json`、`material-visuals.json`、`review.md`、`stages/`：完整方案、文案、逐件设计与提示词、阶段正文及最终总审，不截断正文。
- `references/`、`source-pages/`：实际来源原图、来源网页 HTML 与元数据；来源页保持原字节，元数据路径转为包内路径并记录原始元数据哈希。网页 HTML 是证据，可含脚本，建议按文本核对。
- `evidence/`：逐件参考绑定、实际原始/生成参考哈希、供应商提交参考哈希、生成元数据、批量状态、公开讨论、阶段结构化成果与 CLI 执行/结果/研究及素材网页执行证明/安全诊断/真实附图白名单。`research-evidence.json`、`discovery-evidence.json`、`diagnostics.json` 和完整执行元数据（包括已记录的 reasoning effort）保留；路径转为包根相对路径，白名单之外的原始提示词、ACP base64、进程输出、环境和凭据不进入包。
- `skills/`：本会话固定的完整原始 Skill 文本及其 SHA-256。
- `SHA256SUMS`：全部包内文件的哈希清单（清单自身除外）。`manifest.json` 索引其生成前的文件，后续 manifest 和哈希清单不进行自引用。

`evidence/material-jobs.json` 和 `batch-state.json` 是移植后的证据，不能直接作为新付费批次重跑。原始参考哈希与供应商实际提交哈希可能因预处理不同，两层记录都会保留。

历史失败的 CLI 调用仍保留执行与诊断证据；最终阶段已成功且当前交付齐全时，首次失败本身不会把导出判为 `partial`。失败调用可没有结构化结果，失败的看图准备可没有附件；成功的看图调用仍须有实际附件与结果。已授权生图重试的 `retryHistory` 连同原失败请求 ID、失败原因、诊断、授权依据及最新成功请求/实际文件/检查记录完整保存在批量证据中，不把历史失败改写为成功或丢弃。

同设计质量纠正的 `correctionHistory` 保留原清单、原请求、原图、未通过的真实审查和纠正依据。旧图与元数据单独复制到 `evidence/corrections/<material>/attempt-N/`，作为编辑参考时继续核对原哈希；它不会被当成官方身份来源。当前交付必须是新请求的实际文件并重新通过图像审查。

用户明确授权贴入官方原 Logo 等本地后期时，当前资产标记 `kind: local-postprocess`、`generationStatus: postprocessed`，没有模型、请求 ID 或供应商调用身份，不冒充一次付费生图。`audit/postprocess/<material>/operation-N/` 保留旧真实产图与元数据、旧图审查、官方来源原文件及其哈希、处理工具和参数、授权依据及新输出哈希。完整 `postprocessHistory` 和此前 `correctionHistory` 继续保留，嵌套的旧图也复制入包。当前派生图放入 `materials/`；它必须重新通过对应实际哈希的视觉核验，不能继承旧图审批。下游使用它时仍须精确匹配已批准输出的路径和哈希。

透明参考图为便于看清而铺纯色背景时，原文件不改动。CLI 附件分别保留原始 `sourcePath/sourceHash` 与实际提交的 `path/hash`，两份字节都复制和验哈希；生图元数据另保留参考预处理映射。背景呈现不等于新的品牌素材。

若生图前通过局部草稿修订建立新版本，`evidence/production-draft-amendments.json` 保留外部复核依据、原文和修订正文以及涉及的概念卡文字。原始 CLI 结果仍独立导出，不把外部修订冒充为模型当时的返回。

验收按以下顺序执行：

1. 检查脚本返回的 `status`、`delivered` 和 `issues`；对照本次约定范围确认 `manifest.json` 中每件物料，不能把 `out_of_scope` 当作已制作。
2. 进入导出目录执行 `shasum -a 256 -c SHA256SUMS`，在 ZIP 所在目录执行 `shasum -a 256 -c new-package.zip.sha256`，并用 `unzip -t new-package.zip` 验证压缩包。
3. 实际打开每张纳入交付的图片，对照绑定的来源原图、设计、完整文案与逐件审查证据，核对文字、外形、角色/符号身份、双方辨识度及跨物料一致性。文件校验不能代替这一步。
4. 核对最终总审属于当前版本、全部约定项已检查通过且检查哈希对应实际文件。保留具体局限、待修项和落地确认。

`complete` 表示当前制作范围的实际文件与已保存检查证据完整，不等于人工签署、品牌授权或生产认证。脚本不会凭空生成可编辑设计稿、刀版、视频或制造参数。
