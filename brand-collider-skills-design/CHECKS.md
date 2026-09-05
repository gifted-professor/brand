# 检查记录

## CPA / Astra 切换验证（2026-09-05 追加）

- 当前本地默认：`OPENAI_PROVIDER=cpa`，文本模型与 Responses 顶层模型均为 `gpt-6-astra`，图片模型为 `gpt-image-2`。
- CPA 实时 `/models` 确认 Astra 和 Image 2 均可见；真实文本请求返回预期的 `{"ok":true}`。
- 一次真实生图请求成功，完成时间 `2026-09-05T08:49:40.812Z`；未自动重发图片请求。
- 本地请求 ID：`3424376e-27e5-443d-a85a-22a74462df45`。
- 测试图：[image.png](outputs/images/image-1ec7a2c1-2383-4041-89a5-99253f851c8e/image.png)；[素材元数据](outputs/images/image-1ec7a2c1-2383-4041-89a5-99253f851c8e/asset.json)。
- 内容 SHA-256：`8cbbb0048cda70d3cece491a8518a14faeede62905db28c68e9d6de11967ab35`。
- `npm test`：76/76 通过，包含 5 个 CPA 配置测试；`npm run typecheck` 通过。项目结构校验通过。
- CPA endpoint 和 Key 通过现有 remote-cpa helper 解析；Key 只在进程内存和捕获的子进程管道中传递，不写入项目文件。CPA 模式明确忽略旧网关 Key、地址和 DNS 覆盖，解析失败不会回退到旧网关。
- 本次按用户“直接走 CPA”的要求请求其 Responses 接口，没有修改远端 CPA、账户或 Dashboard 配置。

以下为此前的 Image 2 接入检查记录，保留当时的模型与素材信息。

日期：2026-09-05。环境：Node.js 24.17.0，Python 3.9.6。

## 卡片与真实 Sol 对话更新

`npm run build` 通过；`npm test` 共 **61/61** 项通过。新增检查覆盖结构化卡片校验、双方品牌信息与所选方向汇总、真实调用模型标记、历史会话兼容，以及 Sol 网关忽略 system 时的受信任输出合同传递。构建与测试输出在 `outputs/reviews/card-sol/`。

真实 `gpt-5.6-sol` 会话 `session-bb57d46b-7d17-42a0-bb99-7ab8bb408751` 已完成：首轮创意后追加无新增实物标准，第 2 版选择「预约阅读场」，11 条 A/B 公开发言、六个 Skill、六张结构化卡片均保存。12 次阶段调用中，首次非 JSON 返回失败；兼容修复后显式继续，后续 11 次成功。本次没有生图，方案审查仍列出授权、容量、预约入口等执行待确认项。

浏览器实测 1440×1000 桌面和 390×844 手机，均显示六张真实卡片，无水平溢出；原文弹窗、完整卡片摘要展开、导出和生产构建页面均通过。导出文件逐字等于 API 结果，并包含全部标准、板块与模型记录。手机原文按钮需滚动到可见区域再点击；按实际滚动交互验证通过。浏览器错误为空。凭证未进入前端源文件、构建文件或 API 返回数据，`.env.local` 权限仍为 `0600`。

证据：[真实运行](outputs/reviews/card-sol/live-evidence.json)、[浏览器验收](outputs/reviews/card-sol/browser-evidence.json)、[桌面卡片](outputs/reviews/card-sol/cards-live-grid.png)、[手机卡片](outputs/reviews/card-sol/cards-live-mobile-card.png)。下方保留同日较早阶段的历史记录。

## 网页工作台新增验收

本轮在原生图适配器基础上实现 React/Vite 前端和本地 Node 双品牌运行服务。`npm run build` 通过；`npm test` 共 **55/55** 项通过；`python3 scripts/validate_bundle.py` 通过六项 Skill 及引用检查。测试完整输出位于 `outputs/verification/test-results.txt`。

浏览器实测开发页面 5173 与生产构建页面 4318 均可加载，无浏览器错误或框架错误层。1440×1000 桌面与 390×844 手机视口没有水平溢出，桌面对话输入框完整位于工作区内。已检查 JSON 品牌资料上传解析与保存、实际 Skill 源文弹窗、演示对话、新标准进入第 2 版并使旧方向失效、选择方向后六个板块完成、Markdown 导出包含新标准。通过人为延迟回包确认新草稿不被清空、切换历史后旧响应不覆盖当前项目、方案画布从顶部打开。

真实文本模型 `deepseek-v4-flash` 已从虚构品牌资料走完九个阶段、六项 Skill 的完整文本流程，生成「杯上选书人」方案。十次阶段调用中九次成功，一次因开发热重启中断后显式恢复；没有模型格式或 HTTP 错误，本轮未新增生图调用。会话 `session-f7f46ec9-13bb-47dd-ba83-df5354100658` 已保存，可从历史项目打开。详细证据与内容边界见 [工作台验收记录](docs/WORKBENCH.md#真实文本端到端验证记录)。

当前仍未完成独立图像检查、完整产物 Schema/MCP 工具协议、模板海报排版和多用户生产部署。网页中的视觉制作阶段先生成制作计划；实际出图需要用户单独点击。下方“尚未验收”部分为本轮网页加入前的生图阶段历史记录，当前网页与文本验证以本节为准。

页面截图：[workbench-live.png](outputs/verification/workbench-live.png)。

## 模板包

`python3 scripts/validate_bundle.py` 通过：6 个 Skill frontmatter、6 个局部参考文件、9 个项目 JSON 文件、白名单一致性、虚构事实假设标记、风格与模板引用、模板边界、12 个验收用例定义及 Markdown 围栏。检查排除依赖目录与生成输出。

## Image 2 API 实现

`npm run typecheck` 通过，开发依赖已精确固定并写入 `package-lock.json`。

`npm test`：38 项测试通过（20 项响应解析、18 项配置与本地 HTTP 集成）。覆盖模型分离、鉴权及 endpoint、SSE/JSON 最终图、参考图编辑请求、图片与元数据保存、失败记录、未完成图片不冒充成功、超时不重试、完整最终图之后断流或超时的保留、显式失败优先、HTTP 408/499/5xx 未知状态、并发拒绝、无重定向跟随及写盘失败前阻断请求。测试不使用真实 Key 或付费接口。

凭证扫描确认提供的 Key 仅出现在 `.env.local`；该文件权限为 `0600`，被项目与父目录的 `.gitignore` 忽略。

## 真实网关验证

`npm run image:check` 成功：网关 Key 有效，目录中包含 `gpt-image-2`、`gpt-5.5`、`deepseek-v4-flash`。目录可见性不代表每个模型都完成生成验证。

已实际执行 **1 次计费生图请求**：`POST /v1/responses`，顶层 `gpt-5.5` 调用 `gpt-image-2`，无参考图，提示词为暖色背景中无品牌陶瓷杯的 API 测试图。未对真实接口自动重试。

- 完成时间：2026-09-05 14:27:47（香港时间）。
- 素材：`image-8b862390-d217-4287-b547-3f216c313c26`。
- 本地请求 ID：`2ec9810b-1982-4621-849f-f73f47172f87`。
- 图片：[image.png](outputs/images/image-8b862390-d217-4287-b547-3f216c313c26/image.png)。
- 元数据：[asset.json](outputs/images/image-8b862390-d217-4287-b547-3f216c313c26/asset.json)。
- 文件：PNG，1254 × 1254，1,677,736 bytes；已打开目视核对，画面为单只陶瓷杯。
- SHA-256：`872478a5809511e34bcbd8a9c2f069db0c523d17f4ffef502c1a5edb068b2ad4`。

模型默认的 2K 是提示词偏好，实际像素如上，不宣称精确 2K。图片记录仍保留 `reviewStatus: unverified`，未代替未来的联名设计审核。

本机系统 DNS 解析异常；使用 Tailscale 状态中核实的对应节点地址作为本项目连接覆盖后成功。HTTPS 域名与证书校验始终启用，没有修改系统 DNS 或关闭 TLS 校验。

## 尚未验收

真实参考图编辑调用（已测本地请求契约）、DeepSeek 文本生成、Agent SDK、受控业务工具注册及身份/版本/预算/幂等守卫、海报渲染、品牌条件的图片审核、HTTP 服务、网页与完整业务端到端流程均未验收。`tests/acceptance-cases.json` 仍是 12 个待执行业务场景。

本轮证明 Image 2 API 适配器可用，完整联名创作服务仍需按技术设计继续实现。
