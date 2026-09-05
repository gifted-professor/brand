# 联名碰撞器

本地网页工作台：上传两个品牌的资料，让两个 AI 品牌角色使用六个现有 Skill 讨论联名方向；用户可以从第三方输入框追加标准，选择方向后继续形成六张方案卡片，并可展开查看完整 Skill 原文。

页面展示公开角色发言、Skill 使用记录与阶段结果。角色为 AI 模拟；过程透明不包括模型私有推理，也不代表品牌官方发言。

新增 [制作画布](http://localhost:5173/?view=production&project=manner-hok-20260905)：接入 MANNER × 王者荣耀已有真实方案、图片和制作清单，支持缩放、拖拽、依赖连线、媒体预览与围绕节点继续对话。来源更新后自动同步，使用方式见 [制作画布说明](docs/PRODUCTION_CANVAS.md)。

## 启动工作台

Node.js 24+，在本目录执行：

```bash
npm ci
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)。开发前端将 `/api` 代理到本地 Node 服务的 `4318` 端口。

真实模式读取仅服务端可用的 `.env.local`。当前使用 `OPENAI_PROVIDER=cpa` 与 `OPENAI_MODEL=gpt-6-astra`，通过已安装的 remote-cpa helper 读取本机 CPA 连接与凭证；CPA Key 只进入内存。新机器从 `.env.example` 创建配置并先配置 remote-cpa；原网关方式仍可显式选用 `openai-compatible`。演示模式会明确标注，不需要把演示内容当作真实模型结果。

生产构建由同一 Node 服务提供网页与 API：

```bash
npm run build
npm start
```

打开 [http://localhost:4318](http://localhost:4318)。操作流程、架构和当前限制见 [工作台说明](docs/WORKBENCH.md)。

## API 生图

当前链路是 **CPA → `gpt-6-astra` → `gpt-image-2`**，已真实出图验证。工作台文本模型也配置为 CPA 的 `gpt-6-astra`。参考 `abtop-dashboard` 的 Responses 生图格式，直接请求 CPA `/v1/responses`；凭证通过现有 remote-cpa helper 获取，不使用原 HNCloud Key。

Node.js 24+ 下执行：

```bash
npm run image:check
npm run image:generate -- --prompt "米白色陶瓷杯，暖灰背景，柔和棚拍光，无文字" --ratio 1:1
```

第二条命令会实际生成一张图片并计费。图片与素材元数据保存在 `outputs/images/`。配置、参考图、服务端调用示例和当前边界见 [Image 2 API 接入说明](docs/IMAGE_API.md)。

## 已提供与未提供

已提供：双品牌工作台、品牌资料上传、角色对话、第三方标准输入、方向选择和方案呈现；六个 Skill 方法与参考契约；本地会话保存；ImageProvider、生图 CLI 和真实素材保存。

完整产物 Schema、五个 MCP 工具协议及其全部业务守卫、独立图片内容检查、模板海报渲染器、数据库、可靠 worker 与多用户服务仍待实现。工作台使用简化会话数据和有界双角色协调，不能视为原技术设计已经全部落地。

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
