# 上传理解与匹配体验 V2 / Upload & Matching V2

更新 / Updated: 2026-09-06

## 已完成的部分 / Completed Work

- 资料入口改为多文件上传和拖放，支持文本 PDF、DOCX、TXT、MD、JSON。用户上传已有材料，再核对自动识别的品牌名称；其余手动编辑折叠收起。补充资料时保留原品牌身份和已上传文字。
- Material-first intake supports multiple files and drag-and-drop: text PDFs, DOCX, TXT, MD and JSON. Users upload existing documents, confirm the extracted brand name, and optionally expand manual corrections. Supplementing a profile retains its identity and extracted source documents.

- 资料理解接口将多份材料一起交给模型，提取品牌字段、逐字来源引文，以及针对这家品牌的下一份材料建议。未知、冲突、未获得材料支持的字段不补造。手动更正后取消该字段原来的来源归属，避免错误引用。
- The model endpoint receives all documents together and returns brand fields, verbatim source quotations and brand-specific requests for additional material. Unknown, conflicting and ungrounded fields remain unresolved. Manual corrections remove the original attribution for that field.

- 不改变原有关系评分与权重。资料较少时限制可见连接；不足两条时，从现有品牌池提供最多两条待验证探索线索，不增加分数。聚焦其他品牌会使用对方资料重新计算其关系场。资料完整不等于必然适合合作。
- Existing relation scores and weights are unchanged. Sparse profiles expose fewer connections. If necessary, up to two exploratory leads are offered from the existing pool without increasing their scores. Focusing a partner recalculates the field using that partner's profile. Complete information does not guarantee compatibility.

- 角色沿用既有造型，以虚线和未填充部件呈现资料仍在成形的状态；逐步补充后增加清晰度。平台使用 HackVI 的正式标志、黑白蓝色及字体，品牌角色保留原有配色。
- Existing avatar geometry is retained. Outlines and unfilled parts indicate an evolving profile. The platform follows HackVI's official mark, black/white/blue palette and typography, while existing brand avatars retain their colors.

- 抽卡采用同一次翻转与空间放大；详情正面展示品牌资料。关闭或 Escape 会反向收回角色面，同一组卡可继续查看其他卡，也可在详情内切换。支持减少动态效果偏好。
- Drawing uses one simultaneous spatial expansion and flip. The front displays brand details. Close or Escape reverses the motion to the avatar back. Other cards in the same hand remain available, including navigation within the dialog. Reduced-motion preferences are respected.

## 当前状态与限制 / Current Status & Limits

当前环境未配置可用模型。文字提取可正常使用；页面明确提供“基础识别”，仅识别材料中明确标注的字段，不作语义推断。真正的语义合并和针对性缺口判断需要在服务端配置模型，复用现有 COLLIDER 配置。模型接口的回归测试使用替身提供者，未声称完成真实模型效果验证。

No usable model is configured in this environment. Document extraction works; the UI explicitly labels basic extraction of declared fields. Semantic consolidation and tailored gap diagnosis require a server-side model using the existing COLLIDER configuration. Regression tests use a stub provider; live model quality has not been validated.

每次最多 10 份、每份 8 MB，单份提取文字最多 24,000 字，总文字最多 100,000 字。PDF 最多 30 页，超过则要求拆分，不静默丢弃后续页。扫描图片暂不做 OCR。原文件不被修改或删除；浏览器保存提取文字和资料理解，不是原文件托管系统。未解析的临时上传列表刷新后不会保留；进入匹配后的资料保存在本地浏览器。

Limits: ten documents, 8 MB per document, 24,000 extracted characters per document and 100,000 in total. PDFs over 30 pages are rejected for splitting rather than silently truncated. Scanned images do not have OCR support. Original files are unchanged. The browser stores extracted text and profiles, not a hosted original-file archive. Uncommitted uploads do not survive reload; profiles committed by entering matching persist locally.

## 剩余待完成的部分及计划 / Remaining Work & Plan

1. 配置真实模型，用同品牌的多种材料测试合并、来源、冲突和缺口建议，再评估误提取与遗漏。对重复上传、无关材料、只有计划没有能力、消费者负面证据建立固定评估集。
2. 根据真实使用情况增加 OCR、图片和演示文档支持，并考虑持久化上传、后台解析和进度恢复。
3. 将资料充分度与合作适配度分开验证；通过真实合作结果校准连接策略，不因用户上传更多文件直接奖励更高合作评分。
4. 后续生产化再增加品牌账号、资料访问权限、真实邀请和共享合作空间；现有联系流程仍为本地演示。

1. Configure a live model and evaluate consolidation, citations, contradictions, omissions and targeted gaps with a fixed set of brand documents. Include duplicates, irrelevant documents, plans without capabilities and negative consumer evidence.
2. Add OCR, images and presentations based on demand, followed by durable uploads, background processing and resumable progress.
3. Validate evidence sufficiency separately from collaboration fit. Calibrate discovery against real outcomes instead of rewarding file volume with higher fit scores.
4. Add accounts, document access controls, real invitations and shared collaboration workspaces before production. The current contact flow remains a local demo.

## 遇到的技术难点 / Technical Challenges Encountered

- 多文档来源对应和不确定性：每个模型字段必须带有效文件 ID 和可在原文定位的引文；引文存在不代表语义必然正确，仍需真实模型评估。
- Provenance and uncertainty: model fields need valid document IDs and quotations found in source text. A matching quote does not prove correct interpretation; live model evaluation remains necessary.
- 卡片跨布局动画：从点击卡的真实位置计算缩放与位移，使用同一弹窗元素正反动画；关闭后恢复牌组与交互，不重新洗牌。
- Spatial card transitions: calculate translation and scale from the clicked card, reverse the same dialog animation, then restore the hand without reshuffling.
- 中文字体与布局：原完整字体保留，界面加载约 216 KB 的 WOFF2 子集，其余字符使用系统字体回退。手机布局为单列，详情滚动区域和操作按钮分离。
- Typography and layout: the full original font is retained; the UI loads a roughly 216 KB WOFF2 subset with system fallback for other characters. Mobile intake uses one column, while detail content scrolls independently of its action button.

## 验证 / Validation

- 61 项自动测试通过；包含实际 TXT、MD、DOCX、PDF 提取，坏文件拒绝，来源校验，多品牌冲突，资料稀疏探索，以及原有关系、角色、邀请测试。
- 61 automated tests pass, including real TXT/MD/DOCX/PDF extraction, invalid inputs, source checks, conflicting subjects, sparse exploration and existing relation/avatar/invitation coverage.
- 浏览器实际验证两份资料上传、基础识别、进入匹配、2 条到 12 条连接的聚焦变化、关闭后翻开另一张卡、Escape 退出、追加 Word 文件和 390px 手机布局。Chrome 自动选择文件受扩展权限限制，实际上传验证通过内置浏览器完成。
- Browser checks cover two-file upload, basic extraction, entry into matching, focus expansion from 2 to 12 leads, successive card reveals, Escape, DOCX supplementation and a 390px mobile viewport. Chrome automation lacked file URL permission; actual upload verification used the in-app browser.

测试样例 / Fictional fixtures: [upload-v2](testing/upload-v2/)

模型配置 / Model configuration: [COLLIDER integration](../integrations/README.md)
