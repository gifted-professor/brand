# COLLIDER 提案集成 / Proposal integration

来源 / Source: https://github.com/gifted-professor/brand

本仓库接入方式：直接复用 `../../brand-collider-skills-design/`，包含本地最新媒体能力和 KAI-NEX 画布改进。无需初始化子模块。来源版本与验证记录见 [合并说明](../../docs/BRAND_RELATIONS_MERGE.md)。

## 已接入 / Integrated

- 七个邀请输入项的 AI 图标：基于双方资料、当前草稿和原项目方法生成单项建议；用户主动采用后才覆盖字段。
- 完整文本提案：品牌 A/B 研究 → 创意讨论 → 三方向选择 → 双方设计 → 文案 → 视觉计划 → 文本审查，共九次阶段调用。
- 接入原项目的阶段结果校验、版本与本地会话保存。缺少资料可暂停；失败不伪造结果。
- 生成不会提交或批准邀请。仍需用户自己编辑、提交，以及对方独立回应。

Seven field actions generate editable suggestions with explicit adoption. Full generation uses nine upstream stage calls, three-direction selection, structured validation and local session persistence. Generating content never sends or accepts an invitation.

## 配置 / Setup

在主项目根目录的 `.env.local` 配置自己的模型服务；已有配置应保留，仅补充缺少项。密钥仅由服务端读取。

Configure the model in the main app’s root `.env.local`; preserve any existing configuration. Credentials stay server-side.

```dotenv
OPENAI_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-own-key
OPENAI_MODEL=your-available-model
TEXT_MAX_TOKENS=16384
TEXT_TIMEOUT_MS=180000
TEXT_REASONING_EFFORT=low
```

如果已配置原项目所需的 CPA helper，可以显式使用 `OPENAI_PROVIDER=cpa`；不会自动查找或切换其他凭证。修改后重启开发服务器。状态入口为 `/api/collider/status`，只返回是否配置与模型名，不返回凭证。

An already configured CPA helper can be selected explicitly with `OPENAI_PROVIDER=cpa`; no automatic credential switching occurs. Restart after changing configuration. `/api/collider/status` exposes availability and the model name only.

正常启动主项目即可载入桥接 API。生产预览需使用 Vite preview 加载该插件；仅将 `dist/` 放到静态主机不会提供 AI API。

Starting the main Vite app loads the bridge. Vite preview also loads it. Serving `dist/` on a static host alone does not provide the AI API.

## 边界 / Boundaries

当前环境没有配置可用的模型，因此真实模型调用未验证；原运行时九阶段与单项适配器已用模拟模型测试，网页验证了未配置提示和手动输入保留。没有将模拟输出呈现为真实 AI 成果。

No usable model is configured in the current environment. The original staged runtime and field adapter are tested with mocked providers; the UI verifies unconfigured states and manual-content preservation. Mock output is not shown as live AI output.

会话文件保存在 `outputs/collider-sessions/`。当前浏览器标签页保留对应品牌组合的会话指针，返回提案页可读取上次进度；源会话保留在本地。已提交邀请显示生成成果，但禁用生成与采用操作。主应用尚未接入原项目生图、无限画布、真实多人群聊、邀请网络发送或生产账户权限。原项目本身也是本地单用户工作台。

Sessions persist in `outputs/collider-sessions/`. The current browser tab retains a session pointer per brand pair and can reload its progress. Submitted invitations retain the results view with generation/adoption disabled. Image generation, the upstream infinite canvas, live multi-user chat, network invitations and production access control are outside this integration. The upstream workbench is also a local single-user app.
