# 新对话接续说明 / Conversation Handoff

日期 / Date: 2026-09-06

## 当前完成 / Completed

这是品牌联名工具的本地演示项目。首页、资料导入、引力匹配、抽卡、伙伴详情和邀请预演已连接成连续流程。界面统一中文，品牌专名与文件格式保留原样。

This local brand collaboration demo connects entry, intake, Gravity discovery, cards, partner details and invitation preview. UI copy is Chinese; brand names and file formats retain their original spelling.

- 首页标题：「先理解你的品牌，再开始寻找联名伙伴。」取消角色下方说明，统一网格与左对齐。
- 导入页：多文件导入；文件管理和识别栏目折叠；去掉外层框与框中框，以缩进、分隔线和文字颜色区分栏目与字段；底部按钮仅写「进入引力匹配」，不带箭头。
- 重新生成：第一次导入自动理解；之后文件改变才启用重新生成，手动字段修正不触发模型。
- 导航：页面返回使用无边框箭头。文件移除按钮仍为删除语义。抽卡页无左上角退出按钮，通过模式图标切换。
- 抽卡：删除多余提示，详情不再显示 01／02／03 导航；返回时翻转收回，然后可翻其他卡牌。
- 三级 LOD：完整角色 → 局部头像 → 点。关系评分输入、公式与权重保持不变。
- 28 个内置品牌的显示文案与关系解释中文化；原始匹配快照保留，展示翻译不参与分数计算。

The latest pass refines the entry slogan, nested intake disclosures, borderless back navigation and simplified card details. Gravity uses three visible LOD stages: full character, cropped portrait and point. Chinese presentation does not change scoring inputs or weights.

## 交互精修 / Interaction Refinement

- 首页问号使用透明底，无背景、边框或伪元素填充。
- Gravity 使用随画布尺寸变化的统一展示缩放，保留原位置的方向和距离排序；资料少时不再默认缩至 35%。聚焦品牌显示完整角色，其他节点继续按 LOD 切换。原始评分、权重、连接筛选数量均未改变。
- 抽卡新增咖啡围裙、户外夹克、创意针织三张静态概念素材，结合原有围巾、外套、包袋形成六种示意穿搭。内置品牌按固定映射展示；原始参考图保留，用户上传品牌不会被套入虚构产品证据。素材位于 `public/avatars/draw-v3/`，用于首页、抽卡和 Gravity 的概念角色展示。
- 抽卡放大与收回共用同一角色面。收回以 `animationend` 完成，不使用固定计时器；末帧按源卡真实尺寸和位置对齐，同时淡出遮罩。支持开卡中途返回、窗口尺寸改变及减少动态效果设置。

The question mark has no backdrop. Gravity uses a responsive, uniform presentation scale that preserves angles and distance ordering without altering scores, weights or discovery counts. Sparse scenes no longer start at 35%; the central brand remains a full character.

Three static concept assets add coffee, outdoor and creative outfits to the existing scarf, jacket and bag variants. These are authored demo presentations, not verified products or a newly connected image-generation API. Original references remain intact, and uploaded brands are not assigned fictional product evidence.

Cards now share the same character-face layout across the deck and modal. The return completes on the actual animation-end event, aligns with the source card, and fades the backdrop. Interrupted openings, responsive resizing and reduced motion are supported.

## 本地 Codex / Local Codex

当前本机已接通真实文字推理，通过 Vite 服务端启动已登录的 `codex exec`。无需把账户凭证交给浏览器；沿用 CLI 登录。调用发生在本机，但推理由 Codex 服务提供，并非离线本地模型。

The Vite server invokes the authenticated Codex CLI for real text reasoning. Credentials stay outside the browser. The bridge runs locally; inference is provided by the Codex service, not an offline model.

已实际验证：联名提案名称生成；品牌材料理解（包含原文证据和配饰诊断）。使用临时工作目录、只读沙箱、关闭工具与插件、禁止交互审批、短暂会话、超时及单调用并发限制。模型结果只接受 JSON，随后仍执行原有业务校验。

Live checks cover proposal-title generation and evidence-backed brand analysis including accessory review. Calls use temporary working directories, read-only sandboxing, disabled tools/plugins, noninteractive approvals, ephemeral sessions, timeouts and a concurrency limit. JSON output still passes existing business validation.

本地 `.env.local` 已配置且被 Git 忽略。新电脑需要安装并登录自己的 Codex CLI，再配置：

The local `.env.local` is ignored by Git. On another computer, install and log into your own CLI, then configure:

```dotenv
BRAND_AI_PROVIDER=codex
CODEX_BIN=codex
```

如果 CLI 不在 PATH 中，将 CODEX_BIN 改为本机可执行文件的绝对路径。重启 `pnpm dev`。`/api/collider/status` 应返回 `configured: true` 和 `source: codex-local`。本地桥接仅接受回环地址与本机 Host，不适合直接公开部署。

Use an absolute CODEX_BIN path when needed. Restart `pnpm dev`. The status endpoint should report configured=true and source=codex-local. This bridge accepts only loopback clients and local hosts and is not a public deployment API.

## 演示数据边界 / Demo Boundary

`/?view=lab` 提供一个虚构品牌和八张用户提供的静态形象参考。实验中的资料导入在浏览器读取 TXT / MD / JSON；文本经本机服务发送给 Codex 分析。`lab/analyze-brand` 与 `lab/field` 不创建品牌数据库记录或提案会话。实验品牌、手动修改和建议只存在页面内存，刷新重置。普通流程沿用原有本地品牌保存与提案会话流程。

The visual lab contains one fictional brand and eight supplied image references. Lab text is read in the browser and sent through the local bridge for inference. Stateless lab endpoints create no brand database or proposal-session records. Lab edits and suggestions live only in page memory. The normal flow retains its existing local storage and proposal sessions.

## 未完成与计划 / Remaining Work & Plan

1. Codex 此次接通的是文字理解与建议。专属角色生图仍走现有图片服务；当前未配置，不得称其已接通。实验图是用户提供的静态素材。
2. 完整多阶段提案运行时已支持替换为 Codex 文字提供方，但本轮没有完整跑完全部阶段；已验证单字段和资料理解。
3. 真正的双方账户、发消息、群聊、共同设计页面仍待实现；当前邀请与回应是本地演示。
4. 用户计划后续接入 GitHub。当前仅本地提交；根仓库未配置远端，本轮不推送。上游 COLLIDER 作为子模块固定版本。
5. 后续可完善取消操作向 CLI 子进程传递，以及模型连接失败时的重试体验。

Image generation, a complete live proposal run, real multi-user communication, deployment and GitHub integration remain separate work. This pass commits locally only. Cancellation propagation to CLI processes can be improved.

## 关键文件 / Key Files

- `src/components/CharacterEntry.tsx`, `brand-vi.css`：首页和排版 / entry and styling.
- `src/components/BrandIntakePage.tsx`：导入、层级、重新生成 / intake and regeneration.
- `src/components/DrawPage.tsx`：翻牌和详情 / cards and details.
- `src/domain/chinese.ts`：只影响展示的中文文案 / presentation translations.
- `server/codexProvider.ts`：Codex CLI 适配 / CLI adapter.
- `server/colliderApi.ts`, `vite.config.ts`：本地接口与配置 / server routing.
- `src/components/ProposalAi.tsx`：建议生成与采用 / AI suggestions.

## 启动与验证 / Run & Verify

```sh
git submodule update --init --recursive
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

主要入口 / Routes: `/`、`/?view=avatars`、`/?view=lab`、`/?view=cases`。

官方接入参考 / Official integration reference: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).

## 本轮检查结果 / Verification

110 项自动化测试、TypeScript、完整 ESLint 与 Vite 构建通过。浏览器检查包括桌面端和 390px 手机端：首页文案、嵌套栏目、无边框返回、抽卡收回后换卡、无编号详情导航、网页真实 AI 建议生成与采用。实验邀请页无框架错误层、无控制台错误或警告。手机端页面宽度与视口均为 390px。

110 automated tests, TypeScript, full ESLint and Vite build passed. Browser checks cover desktop and 390px mobile entry, nested disclosures, borderless back actions, sequential card reveals, removed numbered navigation and real AI suggestion adoption. No relevant console errors/warnings or framework overlay were observed.


最新视觉回归：Chrome / Playwright，1280 × 900 与 390 × 844。连续交替开合 12 次，并测试 3 次手机端开合、开卡中途返回、Esc、动画中途改变窗口尺寸、减少动态效果。源卡与收回末帧的四项几何误差均低于 1px。密集与稀疏 Gravity、聚焦切换、缩放、无框导入页均通过。页面非空，无框架错误覆盖层和控制台错误。浏览器测试脚本与截图位于仓库外；当前未安装独立 Browser 技能，使用现有 Playwright + Chrome。Safari / iOS 尚未复测。本轮未改动 AI 提供方，也未重新跑完整 AI 提案。

Latest visual regression: Chrome / Playwright at 1280 × 900 and 390 × 844. Twelve alternating card cycles plus three mobile cycles passed, including interrupted opening, Escape, resizing and reduced motion. Return-frame geometry matches the source within 1px. Dense/sparse Gravity, focus, zoom and the single-surface intake passed, with no blank page, framework overlay or console errors. Temporary QA scripts/screenshots stay outside the repository. The standalone Browser skill was unavailable; existing Playwright and Chrome were used. Safari / iOS remain untested. AI provider logic was not changed or revalidated end to end in this refinement.


## 首页轮换、LOD 与加载状态 / Entry Rotation, LOD & Loading

首页按不同穿搭去重后轮换，采用交叉淡入淡出；标题上沿与虚化角色顶部对齐，去掉首页顶栏横线并收紧顶部留白。减少动态效果设置下停止自动轮换。

The entry cycles through distinct concept outfits with cross-fades. The heading aligns with the blurred figure top, with a compact header and no header rule. Automatic cycling stops under reduced motion.

LOD 增强从中心向边缘的细节衰减；按完整角色和局部头像的尺寸检查边缘与控件遮挡。密集节点按中心优先保留可读空间，拥挤时降级显示，原位置、匹配分数和权重不变。窄画布使用紧凑头像标签。

LOD now checks each stage against canvas edges and controls, then reserves readable space from the center outward. Crowded nodes reduce detail rather than move or change score. Narrow canvases use compact portrait labels.

上传、重新生成角色、AI 字段建议与完整提案按钮均显示旋转图标、中文阶段文字及 aria-busy，并在等待期间禁用重复提交；错误或成功后恢复。没有虚构百分比进度。

Upload, regeneration, field suggestions and full proposal controls show a spinner, stage text and aria-busy while pending. They prevent duplicate submission and recover after success/failure, without fabricated percentage progress.

本次视觉验证使用 Chrome / Playwright，检查 1280×900、390×844，以及初始、放大、缩小、平移等 10 种 LOD 场景；未发现带名称节点重叠或裁切。加载测试用可控延迟的模拟响应覆盖等待、成功采用和失败恢复，不代表重新验证了真实模型输出。110 项单元测试、类型检查、ESLint 与构建通过。截图和测试脚本保留于仓库外 `/tmp/brand-lod-loading-qa/`。

Chrome / Playwright covered desktop/mobile and ten zoom/pan/sparse-scene scenarios without overlapping or clipped named nodes. Loading tests used controlled delayed mock responses to verify pending, adoption and recovery; live model quality was not re-tested. All 110 unit tests, type checking, ESLint and build passed. Temporary visual QA evidence stays outside the repository.


窗口尺寸改变时曾发现节点位置的 650ms CSS 过渡与即时 LOD 判定不同步，导致过渡中的标签裁切；现已取消引力节点的独立位置过渡，让位置与层级使用同一快照。镜头导航仍沿用原有动画。稀疏和密集场景均纳入最后复测。

Resize testing caught a mismatch between a 650ms position transition and immediate LOD updates. The independent node-position transition is now removed so layout and disclosure use the same snapshot. Existing camera navigation remains animated. Final checks include sparse and dense fields.


## Gravity 三档与更多可探索品牌 / Three-stage Gravity & Expanded Exploration

Gravity 展示当前品牌库中的所有品牌；资料少时仍只保留原筛选数量的连接线索。其余品牌标注「待探索」，可查看概括并聚焦它的关系；不会计入底部连接线索数量。评分公式与权重不变。普通品牌库包含 28 个内置品牌，导入一个品牌后共 29 个；实验场景显示 9 个品牌，仍不写入后台。

Gravity makes the entire active library explorable while keeping evidence-based clue counts unchanged. Other candidates are labelled as exploratory, with summaries and focus navigation; they do not inflate the footer count. Scores and weights are unchanged. The standard library has 28 fixtures, or 29 after one import; the isolated lab has nine brands and writes no backend records.

可见 LOD 仅有完整角色、局部头像和点，移除 Gravity 虚化中间态。中心完整角色阈值为 0.74，头像为 0.42；边缘、控件遮挡和拥挤会降低显示层级。视口外休眠仅用于性能处理，不是第四种视觉层级。首页的虚化效果保留。Gravity 与抽卡使用同一套概念穿搭；上传品牌仍优先使用实际生成结果。

Only full characters, cropped portraits and points are visible. Central full-character and portrait thresholds are 0.74 and 0.42; edges, controls and crowding reduce detail. Off-screen culling is an internal optimization, not a fourth visual stage. Entry blur remains. Gravity and cards share concept outfits; uploaded brands retain generated-art precedence.

验证：110 项单元测试、TypeScript、ESLint、构建通过。Chrome / Playwright 覆盖 1280×900 与 390×844、10 种缩放/平移/品牌库场景；带名称节点无重叠或裁切，无页面错误。另验证稀疏资料下仍有 29 个可探索品牌、最多 2 条初始线索，选择待探索品牌不增加线索，聚焦完整品牌后线索增加，回到自身品牌恢复原数量。本次未调用真实 AI；Safari / iOS 尚未验证。

Validation: 110 unit tests, TypeScript, ESLint and build passed. Chrome / Playwright covered desktop/mobile and ten zoom, pan and library scenarios, with no overlapping/clipped named nodes or page errors. A sparse-profile flow verified 29 explorable brands with at most two initial clues, unchanged counts on candidate selection, expanded clues after focusing a complete brand, and restored counts on return. No live AI was called; Safari / iOS remain untested.
