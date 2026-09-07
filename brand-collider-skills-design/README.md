# Spark 火花 · 共创工作台

> 完整项目介绍、实际界面截图、操作流程与架构图见 [项目总览 README](../README.md)。当前界面为「无限画布 + 持续协作对话」，交互细节见 [统一工作空间](docs/UNIFIED_WORKSPACE.md)。

本地网页工作台：上传两个品牌的资料，让两个 AI 品牌角色使用六个现有 Skill 讨论联名方向；用户可以从第三方输入框追加标准，选择方向后继续形成六张方案卡片，并可展开查看完整 Skill 原文。

页面展示公开角色发言、Skill 使用记录与阶段结果。角色为 AI 模拟；过程透明不包括模型私有推理，也不代表品牌官方发言。

联名设计以双方主营产品、内容或服务为核心，支持品牌 × 品牌、IP、设计师或文化机构等两方合作。品类开放，覆盖咖啡、3C、首饰、鞋服、美妆、家居及数字服务等场景，允许双方共同开发。默认充分展开约 20–30 个有独立用途的候选物料，区分核心、推荐和可选，按用户范围调整；服务项目无需强加实体周边。每件物料都有设计、合作资产表达、执行条件与独立视觉提示词，可在画布查看、讨论并随方案导出。详见 [物料策划说明](docs/MATERIAL_PLANNING.md) 与 [67 个案例的合作产物研究及首饰补充例](docs/COLLABORATION_PRODUCTS.md)。完整自动制作流程可按本轮范围逐件生图与审查；候选清单不代表所有物料都已生成或验收。开放品类不等于每种组合均已通过真实模型或生产验证。

六个 Skill 共用 [开放品类适配方法](.claude/skills/brand-profile/references/CATEGORY_ADAPTATION.md)，从业务能力、产品线、用户动作与环境推导可设计部位、双方融合和物料；通过主营深化、邻近延伸及探索提案发散。方法全文实际加载并固定哈希，行业示例按需参考，陌生品类无需先加模板。范围说明、程序检查和行为评估入口见 [物料策划说明](docs/MATERIAL_PLANNING.md)。

新增 [制作画布](http://localhost:5173/?view=production&project=manner-hok-20260905)：接入 MANNER × 王者荣耀已有真实方案、图片和制作清单，支持缩放、拖拽、依赖连线、媒体预览与围绕节点继续对话。来源更新后自动同步，使用方式见 [制作画布说明](docs/PRODUCTION_CANVAS.md)。

## 启动工作台

Node.js 24+，在本目录执行：

```bash
npm ci
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)。开发前端将 `/api` 代理到本地 Node 服务的 `4318` 端口。

真实模式读取仅服务端可用的 `.env.local`。复制 `.env.example` 后，选择本机已登录的 CLI；真实生图需要另填自己的图像服务地址与密钥。默认示例不依赖维护者的 CPA。完整配置与实测边界见 [Spark 火花使用指南](../README.md#配置真实生图)。

生产构建由同一 Node 服务提供网页与 API：

```bash
npm run build
npm start
```

打开 [http://localhost:4318](http://localhost:4318)。操作流程、架构和当前限制见 [工作台说明](docs/WORKBENCH.md)。

## API 生图

图像适配器请求配置服务的 `/v1/responses`，通过 `image_generation` 工具使用 `gpt-image-2`。`IMAGE_RESPONSES_MODEL` 是独立的主模型配置，文字协作使用所选 CLI。2026-09-07 实测通过已配置的 CPA 生成图片；CPA 是可选接入方式，新用户也可配置满足协议的自有服务。

Node.js 24+ 下执行：

```bash
npm run image:check
npm run image:generate -- --prompt "米白色陶瓷杯，暖灰背景，柔和棚拍光，无文字" --ratio 1:1
```

第二条命令会实际生成一张图片并计费。图片与素材元数据保存在 `outputs/images/`。配置、参考图、服务端调用示例和当前边界见 [Image 2 API 接入说明](docs/IMAGE_API.md)。

## 已提供与未提供

已提供：双品牌工作台、品牌资料上传、角色对话、第三方标准输入、方向选择和方案呈现；六个 Skill 方法与参考契约；本地会话保存；ImageProvider、生图 CLI 和真实素材保存。

完整技术设计中的全部业务守卫、模板海报渲染器、数据库、可靠 worker 与多用户服务仍待实现。自动制作已接入逐件图像审查，但仍有待核实记录归档等限制。工作台使用简化会话数据和有界双角色协调，不能视为原技术设计已经全部落地。

当前双品牌角色是用户更新后的产品方向，替代早期文档中的单导演设想。[TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)、[agent/SYSTEM.md](agent/SYSTEM.md) 和 [CONTRACTS.md](contracts/CONTRACTS.md)保留完整设计与契约参考；`config/runtime.example.json` 仍是草案，不是当前网页配置或可直接传入 SDK 的对象。

复制 `.claude/skills/` 本身不会创建 API 或执行工具。工作台读取项目受信任的 Skill 文件来应用方法，上传的品牌资料只是任务数据。

## 文件检查

安装 `PyYAML` 后，可执行：

```bash
python scripts/validate_bundle.py
```

此脚本只检查本包文件、YAML、JSON、必要名称和引用一致性，不调用模型，不代表联名效果或集成已验收。

## 测试资料

`examples/fictional-brief.json` 中两个品牌与资源均为演示设定，不代表真实企业。风格、海报模板仅提供配置数据，没有附带字体文件或真实渲染结果。

主文档第 15 节列出核对过的官方参考资料。具体实现锁定 SDK 依赖后，还要做加载和工具权限烟雾测试。

## 上游案例资料

项目另提供 [brand-case-research](../brand-case-research/SKILL.md)，负责导入报告、维护证据、检索历史案例。资料库位于 `../品牌物料/案例库/`，由该研究 Skill 在创作任务之外维护；本包仍保留六个创作 Skill 的运行时白名单。

六个 Skill 可通过 `get_context.researchContext` 消费按任务筛选的案例。已提供本地检索及资料包生成脚本；将资料包放入真实 `get_context` 的服务适配仍待实现。案例不会自动成为当前品牌事实、可用资源或授权素材。详见研究 Skill 的 [消费接口](../brand-case-research/references/consumer-contract.md)。

## 在画布选择本地 CLI

点击画布右上角的 CLI / 模型名称，检测服务所在电脑的 Codex、Grok、Claude Code 和 Gemini CLI。当前支持选择 Codex 或 Grok 执行共创流程；Claude Code 和 Gemini CLI 仅显示安装情况，暂未接入执行适配器。

Codex 会检查本机登录状态；Grok 的登录状态与模型可用性需要在实际执行时确认。保存选择只检查 CLI，不发送模型请求。模型名称需要填写当前 CLI 支持的值。CLI 仍连接对应模型服务并使用其账号额度，图像生成仍由单独的图像 API 配置提供。

选择仅保存 CLI ID 和模型名到会话输出目录下的 `local-cli.json`（权限 0600，输出目录默认被 Git 忽略），重启恢复。接口不返回凭据、环境变量或原始 CLI 输出。正在运行的任务必须先暂停并等待进程退出才能切换；已完成成果保持不变。检测的是运行服务的电脑，网页本身不能扫描另一台访问者电脑上的软件。
