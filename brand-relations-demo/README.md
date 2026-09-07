# Brand Relations · 品牌发现与渠道预演

当前主流程：品牌资料与角色 → 引力匹配 / 抽卡 → 申请建联 → 原 COLLIDER 无限画板 → 对话生成、修订与导出。平台使用蓝、黑、白的统一 VI，双方渠道内容各自沿用发布方的品牌视觉，只增加合作方署名与内容互荐。

- 首页 `/`：居中 Logo 和角色入口。
- 主要案例 `/?view=cases`：库迪咖啡 × 奶龙，一对一渠道互荐的演示案例，双方各自保留原有品牌视觉。
- 联名项目 `/#projects`：保存在本机的项目与历史预演。
- 原画板 `/canvas.html?relation=<project-id>`：自动带入双方资料、两张模板预演和可恢复的原生对话会话。旧 `/#project=<id>` 链接自动转入画板。
- 原参考案例保留在 `/?view=legacy-cases`；历史四步工作台源文件保留，已退出主流程。

`canvas-entry.tsx` 直接导入同事项目的 `web/App.tsx`、`ProductionWorkspace` 和 `ProductionCanvas`，服务端复用原 `createHttpServer` 与 `ColliderRuntime`。宿主仅适配已保存的品牌/预演数据、导航及统一样式。详细说明见 [COLLIDER 接入记录](docs/COLLIDER-INTEGRATION.md)。

文字与图片服务是否可用，以本机配置及状态接口为准。图片 API 未配置时，两张图片明确标为模板预演，文字方案与逐件视觉提示词通过原流程生成；不会将模板或提示词标为实时 AI 出图。所有建联与确认均为本地演示，不发送真实邀约。

## 完整联名共创

进入共创画布后，点击 **一键生成完整联名方案**，自动带入双方资料并推进九步协作：品牌研究、创意收敛、产品与体验设计、物料清单、文案、视觉与审查。右侧可展开查看每一步的实际进度，暂停后可以继续。已有渠道预演作为参考保留。

发现入口在服务端继承相邻工作台的 `.env.local` 模型与图片配置，本入口同名配置优先。支持原工作台的 Grok/Codex CLI；自动物料能力就绪时包含逐件出图，否则会明确提示只生成方案与提示词。完整流程会话保存在本入口的 outputs 中，重新进入会恢复。

## 早期原型记录

新对话请先阅读 / Start a new conversation with: [接续说明 / Handoff](docs/HANDOFF-CN-EN.md)。

最新界面与实验页说明 / Latest UI & visual lab notes: [双语更新记录](docs/AVATAR-LAB-LOD-UPDATE-CN-EN.md)。

独立的 React + TypeScript + Vite 前端 Demo。当前目录原本为空，没有现有框架、业务功能或 Git 仓库。

验证核心体验：**同一个品牌世界，会因 Focus 改变而重组为不同的合作引力场。**

当前迭代区分三个概念：Focus 定义关系世界，Gravity 决定世界坐标，Viewport 决定渲染细节。世界范围为 4200 × 3600；初始只呈现局部，28 个品牌数据在页面生命周期内固定。

## 本地运行

需要 Node.js 24+ 和 pnpm 10.11.0。

```sh
npm --prefix brand-collider-skills-design ci
cd brand-relations-demo
npx --yes pnpm@10.11.0 install --frozen-lockfile
npx --yes pnpm@10.11.0 dev
```

打开 http://127.0.0.1:5174/ 。本地服务只绑定 loopback。

本仓库直接复用相邻的 `../brand-collider-skills-design/`，无需子模块；工作台改动会同时用于此入口。原始来源与合并说明见 [接入说明](../docs/BRAND_RELATIONS_MERGE.md)。

资料页 `/#intake` 已预置库迪的 8 份品牌资料和 9 个栏目，可以直接进入品牌角色页，再探索 42 个内置品牌。库迪 × 奶龙的两张预生成渠道图随源码提供，不依赖本机历史会话；申请建联后进入原画板对话。实际生成、审批与发布仍须由双方确认。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

构建产物位于 `dist/`。本地规则预览与关系场不依赖外部网络；AI 形象生成需要下述服务端配置。

## 公司形象工作室

顶栏 **创建品牌形象** → 填写公司名称、定位、已有能力、合作需求与品牌气质 → 生成三个候选 → 查看部件依据 → 选择并应用。可用“填入示例”快速体验。已应用的公司在详情栏可再次调整资料与形象。

- AI 理解公司资料，输出结构化能力、六个部件参数与三个候选设计；前端用原创参数化 SVG 绘制，没有额外图片请求或 WebGL。
- 六个部件分别表达设计研发、生产交付、数字技术、渠道空间、社群活动、文化内容。尺寸是艺术侧重，不是经过验证的能力评分；未提及的能力使用基础尺寸。
- 三个候选共享同一套能力解释，使用圆润、棱面、有机轮廓，搭配六套受控配色和独立纹样。选择画风不改变关系评分。
- AI 尚未配置时，按钮明确显示未连接；可以选择“本地规则预览”，结果标注“非 AI”。该预览仅识别有限的中英文明确词组。
- 选中的资料与形象保存在当前浏览器的 `brand-gravity-characters-v1` 本地存储中，刷新后仍可从图鉴选择；不跨设备同步。最多 40 家新增公司。原始 28 家示例不变。

### OpenAI 配置

联名提案使用本地 Codex 时（`BRAND_AI_PROVIDER=codex`），默认使用 `gpt-5.4-mini` 和低推理强度，优先快速生成简洁初稿。可在服务端 `.env.local` 设置 `CODEX_MODEL`、`CODEX_REASONING_EFFORT`（`low/medium/high/xhigh`）后重启服务；状态接口与新提案记录会显示实际请求的模型。JSON 结构和提案约束校验仍会执行。

默认「快速生成联名初稿」通过 `/api/collider/quick-proposal` 一次生成名称、合作点子、双方分工和待确认事项，结果可直接填入邀请并在当前浏览器会话恢复。单字段建议同样使用精简提示，只发送相关品牌资料与草稿。原有九轮流程保留在「多轮深化提案」中，历史记录不受影响；快速初稿不代表已完成多轮研究或审查。

将 `.env.example` 的内容复制到新建的 `.env.local`，填写服务端 `OPENAI_API_KEY`，然后重启 `pnpm dev`。不要给密钥加 `VITE_` 前缀，也不要放在浏览器或提交到仓库。默认模型 `gpt-4.1-mini`，可通过 `OPENAI_MODEL` 修改为支持 Structured Outputs 的模型。

`server/characterApi.ts` 提供 `GET /api/character/status` 和 `POST /api/character/generate`；使用 [Responses API Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)，`store: false`。生成前 UI 提示公司资料将发送到 OpenAI。模型返回结构化参数，不能返回可执行代码或 SVG。服务端验证能力引用、部件范围和候选一致性，并处理超时、取消、拒绝、额度错误和并发限制。

接口接在 Vite 的本地开发及 preview 中间件中；**只复制 `dist/` 到静态托管不会带上 AI 接口**。上线需要独立部署服务端接口并加入身份与用量管理。本轮未配置实际密钥，AI 适配器通过模拟服务响应测试，未验证真实账户调用。

新增公司也会进入现有 Mock 关系引擎；该引擎仍主要识别英文样例词组，中文资料生成的关系分数不代表真实合作判断。AI 形象理解与关系评分保持独立。

## 操作

- 拖动画布：探索同一个关系世界。从角色开始拖动也不会改变 Focus 或 Selected Brand。
- 滚轮／触控板纵向滚动、+/−：缩放；滚轮以指针位置为锚点。
- 点击角色／marker，或用 Enter／Space 激活：只 Select / Inspect；悬停不会覆盖已有选择。
- Inspector 的 **Set as Focus**：明确切换语义中心，重新计算关系和位置，重置视口；随后解释新 Focus 与旧 Focus 的关系。
- **Center Focus**：保留当前 Focus，把视口移回中心并恢复默认缩放；不重新计算关系或布局。
- **My Brand**：恢复自己的品牌（默认 Memory Block），重新读取其关系场并重置视口。可通过 `App.homeBrandId` 配置自己的品牌。
- 已移除 Regenerate world 按钮。`generateMockBrands` 保留确定性 seed 接口供开发测试，但普通 UI 操作始终使用固定快照。
- Brand brief：查看完整 Mock Snapshot。
- 移动端支持触摸拖拽、点击和缩放按钮；Inspector 排在画布下方。双指捏合不属于当前实现。
- 系统开启 reduced motion 时关闭节点移动过渡。

## 数据分层与主要文件

```text
src/data/mockBrands.ts       generateMockBrands(seed) → 28 Brand snapshots
           ↓
src/engines/relation.ts      calculateMockRelation(focus, target)
           ↓
src/domain/types.ts          RelationResult / WorldDataSource contract
           ↓
src/engines/gravity.ts       calculateGravityPositions(focusId, relations)
           ↓
                            SpatialPosition[]
           ↓
src/engines/viewport.ts           bounds + projection + visual priority + visibility
           ↓
src/components/GravityWorld.tsx   throttled viewport snapshot → node LOD
src/components/BrandNode.tsx      renderNodeLOD(full / simple / marker / dormant)
src/components/Character.tsx      renderPlaceholderCharacter(seed, lod)
```

- `src/data/source.ts`：当前 Mock 数据适配器；通过 `App` 的 `dataSource` 参数注入。
- `src/config.ts`：集中配置关系权重、LOD 阈值、距离映射和视口参数。
- `src/hooks/useViewport.ts`：直接写入 camera transform、指针捕获、拖拽阈值、滚轮锚点缩放；不导入 Relation 或 Gravity Engine。
- `src/hooks/throttledUpdater.ts`：100ms leading/trailing 节流，pointerup 立即 flush，停止输入后没有持续任务。
- `src/components/RelationInspector.tsx`：显示关系类型、五维评分、原因、可能结果与未解决问题。
- `src/App.tsx`：分开维护 Home Focus、Current Focus 和 Selected Brand；只有 Focus、My Brand reload 或数据源变化会更新关系场。
- `src/engines/engines.test.ts`、`src/engines/viewport.test.ts`、`src/hooks/throttledUpdater.test.ts`：原关系契约、新 LOD 和调度测试。

## 当前 Relation 如何工作

所有评分都是 Mock，不是经过验证的真实合作预测。

引擎从自然语言快照中提取关键词，使用项目意图关联规则、双向 offers-to-needs 匹配、相邻受众规则和气质规则评分。没有按品牌 ID 写死的配对分数。

权重集中在 `RELATION_WEIGHTS`：Intent 35%、Complementarity 30%、Audience Expansion 15%、Chemistry 15%、Feasibility 5%。最终 Fit 为加权和取整。

- 相同能力不会提高互补分。同类工作室缺少相互补足的能力时归为 Peer。
- 项目意图不匹配会显著拉低总分，即使能力互补。
- Craft × Technology 可以产生 Productive Tension。
- 受众完全相同低于相邻而不同的受众。
- 不根据品牌大小或地理位置扣分；只有明确的生产约束冲突才降低可行性。
- FNV-1a hash 从品牌描述产生很小的固定扰动。同样的快照始终得到同样的结果；角色种子不参与关系评分。
- 同一对品牌的数字是对称的，解释文字则按当前 Focus 的方向生成。
- 支持需求中的全部 11 种关系类型。当前词典只覆盖本轮英文 Mock 样本，并不具备通用自然语言理解能力。

默认世界中：Memory Block × Still Studio 为 **62 / Peer**，Memory Block × Form Works 为 **87 / Mutual Complement**，Memory Block × Clear Ledger 为 **22 / Weak Fit**。

## 当前 Gravity / LOD 如何工作

```text
distance = 280 + (1 - clamp(fit, 0, 100) / 100)^1.65 × (1800 - 280)
```

Fit 唯一决定半径，所以更高 Fit 始终更近。方向仍由稳定 hash 与 golden angle 决定；每个节点都预留 180 × 150 的间距，再做次数有上限的角度避碰。低 Fit 节点在被探索时也有足够空间显示角色。`SpatialPosition` 已不包含 LOD。

Viewport 逻辑集中在 `getViewportBounds()`、`getNodeScreenPosition()`、`calculateViewportLOD()`、`updateVisibleNodes()` 中；参数集中在 `VIEWPORT_LOD_CONFIG`。

1. 节点距离视口超过 220 屏幕像素：**DORMANT**，保留一个空位置容器，卸载按钮、SVG、文字。
2. Zoom ≤0.45、位于视口边缘／外侧、或详细内容会被标题／图例／缩放控件遮挡：**MARKER**，只渲染按钮和圆点。缩小后圆点仍保留约 7px 屏幕尺寸。
3. 其余节点根据 `visualPriority = gravityImportance × viewportImportance × zoomFactor` 计算细节。Gravity importance 有 0.55 的下限，让远处的弱关系品牌在被探索时仍能升级；视口中心优先级高，边缘降低，放大提高局部优先级。
4. Priority ≥0.72 且 Zoom ≥0.6：**FULL**，完整 SVG、名称和 Fit。Priority ≥0.58：**SIMPLE**，简化 SVG 和名称。其余为 MARKER。

Focus 永远位于世界坐标 `(0, 0)`，但同样接受视口降级；离屏后可以 DORMANT。Pan 不会自动改变 Focus。Inspect 自己时显示 Current focus 提示，不伪造 self-fit。

拖拽每个 pointermove 只更新 ref、宽松边界约束和 camera CSS transform。React 只接收约每 100ms 一次的视口快照，进行 O(n) 可见性／LOD 检查；松手立即用最终位置再更新一次。节点容器稳定，memo 组件仅在 LOD 或选择状态变化时更新内容。没有持续 force、持续 requestAnimationFrame、轮询定时器或 WebGL；节流定时器仅在有待处理输入时存在。

## 未来替换接口

1. `generateMockBrands()` → `loadBrandSnapshots()`：保留 `Brand` 字段和稳定 ID。
2. `calculateMockRelation()` / `WorldDataSource.getRelations()` → relation cache / Batch LLM 的 `RelationResult[]`。
3. `renderPlaceholderCharacter()` → 真实角色资产加载与 LOD 展示。

`WorldDataSource` 当前是同步的、已加载的快照接口（至少 2 个品牌）。真实接口可以先在独立加载层异步获取、校验与缓存数据，再注入适配器；生产级 loading/error/retry 不在 V0 范围。Gravity Engine 只接受关系结果，不需要随数据源或角色替换而重写。

## 验证范围

23 项单元测试覆盖原六组关系样本、756 个有向品牌对的确定性、28 个焦点的稳定布局、5 个种子的全部节点避碰、视口坐标转换、Focus 离屏降级、低 Fit 节点唤醒、Zoom LOD、控件遮挡、节流和松手 flush。

本轮浏览器验证覆盖 Select 与 Focus 分离、Set as Focus、My Brand、Center Focus、稳定快照、长距离 Pan、真实 DOM 降级／恢复、滚轮和按钮缩放、静止时不继续计算、键盘、触摸和移动排版。通过仅在测试中注入计数器，实测 90 次 pointermove 中 Relation／Gravity／Dataset 调用次数不变，LOD 约每 100ms 更新。开发环境 React StrictMode 会重复调用计算函数，因此计数器记录约两倍调用次数；生产构建没有这项开发检查。

已检查 1536×1024、1280×720、390×844；首屏详细品牌数量随真实视口大小变化。小屏会显示更少细节。未验证 Safari、Firefox、实体触摸设备。世界是有限的稀疏品牌场，边缘没有无限品牌生成。

初始 V0 不含角色生成；后续已加入抽卡、能力角色图鉴和上文的公司形象工作室。关系模型仍使用 Mock 数据与规则，尚无数据库、账号或跨设备同步。
