# Image 2 API 接入

当前本地配置：**CPA → `gpt-5.5` → `gpt-image-2`**。2026-09-05 的旧 GPT-5.5 联名批次已有一张成功、一张超时；成功记录恰在 780 秒超时点落盘，旧实现可能一直等连接收尾才取出已返回图片。新版本处理完整 SSE 事件并记录阶段耗时；用户授权的同素材单张实测已在 257.788 秒保存成功，完整图收到后约 1 秒交付。工作台与 CLI 共用配置。历史 HNCloud 接入保留为显式可选模式，不自动回退。

本项目已实现服务端 `ImageProvider` 和本地命令行，可直接通过用户提供的 OpenAI-compatible 网关生成图片，保存图片文件、素材 ID、SHA-256 和供应商请求 ID。运行需要 Node.js 24+；参考图预处理使用 `sharp`，安装依赖请运行 `npm ci`。

## 参考实现与模型配置

支持两种服务端来源：`OPENAI_PROVIDER=openai-compatible` 使用原网关配置；`OPENAI_PROVIDER=cpa` 按用户要求直接调用已配置 CPA 的 `/v1/responses`，不依赖 Mac mini Dashboard。CPA 模式在启动时通过本机已安装的 remote-cpa helper 读取连接配置并取得凭证，Key 只进入进程内存，不写入项目。

CPA 配置方式：

```dotenv
OPENAI_PROVIDER=cpa
OPENAI_MODEL=gpt-6-astra
IMAGE_RESPONSES_MODEL=gpt-5.5
IMAGE_REASONING_EFFORT=low
IMAGE_MODEL=gpt-image-2
```

需要本机已有 `~/.codex/skills/remote-cpa/scripts/cpa_request.py`、Python 3、有效的 `~/.codex/remote-cpa.local.json` 和其中配置的 SSH 凭证读取能力。helper 验证配置权限并按现有 CPA 规则解析凭证；失败即停止，不自动回退到 HNCloud。CPA 模式忽略原网关的 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`IMAGE_CONNECT_IP`，避免混用凭证或 DNS 覆盖。沿用配置中已经核实的 Tailscale 地址；HTTP 仅额外允许 CPA 配置中的 Tailscale IPv4 地址，公网仍要求 HTTPS。

修改本地环境文件后，重启已运行的工作台服务，使新配置生效。已有会话和历史素材的模型记录不改写。以下表格给出未启用 CPA 时的原网关默认值。

参考 `abtop-dashboard` 本地已有的 `origin/snapshot-20260901-imagine` 分支：`image_generation.py` 中的 Responses 请求格式与流式返回处理。该项目当前 main 没有生图模块，本次没有改动参考项目或切换其分支。

| 配置 | 用途 | 默认值 |
|---|---|---|
| `OPENAI_BASE_URL` | 网关地址，可使用域名根路径或以 `/v1` 结尾 | `https://hncloud-newapi.tail400674.ts.net/v1` |
| `OPENAI_API_KEY` | 仅服务端使用的 Key | 必填 |
| `OPENAI_PROVIDER` | 服务端来源 | `openai-compatible`（可设为 `cpa`） |
| `OPENAI_MODEL` | 工作台文本创意模型 | `gpt-5.6-sol` |
| `IMAGE_RESPONSES_MODEL` | Responses 顶层模型，调用生图工具 | `gpt-5.5` |
| `IMAGE_MODEL` | 实际生图工具模型 | `gpt-image-2` |
| `IMAGE_REASONING_EFFORT` | 顶层模型推理强度；`auto` 不发送该字段 | GPT-5.5 为 `low`，其他模型 `auto` |
| `IMAGE_OPTIMIZE_REFERENCES` | 本地压缩参考图；`false` 原样发送 | `true` |
| `IMAGE_FINAL_IMAGE_GRACE_MS` | 完整图片收到后等待尾部事件；`0` 关闭提前收尾 | `1000` |
| `IMAGE_TIMEOUT_MS` | 单次请求的总超时，包含响应读取 | `780000` |
| `IMAGE_OUTPUT_DIR` | 图片与元数据存储目录 | `./outputs/images` |
| `IMAGE_CONNECT_IP` | 可选、已核实的网关 IP，解决本机 DNS 异常 | 默认不设置 |

请求发往 `POST /v1/responses`，不是 `/images/generations`。顶层模型来自 `IMAGE_RESPONSES_MODEL`，工具声明为 `{type: "image_generation", model: "gpt-image-2"}`；工作台文本模型由 `OPENAI_MODEL` 独立指定。

已有本地 `.env.local` 存放当前配置，文件权限为 `0600`，被项目与父目录 `.gitignore` 忽略。其他机器复制 `.env.example` 并配置 remote-cpa；只有显式改用 `openai-compatible` 时才填写网关 Key。CLI 自动读取本项目目录的 `.env.local`，进程中已经设置的环境变量优先；配置文件填写普通 URL，不要粘贴 Markdown 链接格式。

本机测试时，系统 DNS 把网关域名解析到公网地址并导致 TLS 连接失败；从正在运行的 Tailscale 节点信息核实地址后，设置了本项目的 `IMAGE_CONNECT_IP`。覆盖仅影响此适配器建立连接时的地址，原始 Host、TLS SNI 与证书校验保持启用，不改系统 DNS，不跟随重定向。迁移机器时优先使用正常域名解析；如需 IP 覆盖，应重新核实节点地址。

## 使用

在 `brand-collider-skills-design` 目录执行：

```bash
# 读取 /v1/models：检查 Key、连接与模型可见性，不生成图片。
npm run image:check

# 一次命令生成一张图片，会发送实际计费请求。
npm run image:generate -- --prompt "米白色陶瓷杯，暖灰背景，柔和棚拍光，无文字" --ratio 1:1

# 长提示词、禁止项与本地参考图；--reference 最多出现四次。
npm run image:generate -- --prompt-file prompt.txt --negative "礼盒、赠品、文字" --ratio 3:4 --reference product.png
```

画幅支持 `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16`，`--detail` 支持 `2K / 4K`。它们沿用参考实现的提示词控制方式，不保证输出的精确像素尺寸。参考图仅接受本地 PNG、JPEG、WebP，每张最多 6 MiB；有参考图时使用 `action: edit`，否则使用 `generate`。不支持远程参考 URL，避免从不受控位置读取内容。

成功输出 JSON 中包含 `path`、`metadataPath`、`assetId`、`contentHash`、`providerRequestId`、`providerResponseId` 和本地 `requestId`。每张图保存到独立目录，图片和元数据权限为 `0600`；`reviewStatus` 初始为 `unverified`。这是内部生成素材，尚未合成对外作品的概念标记或海报。

`image:check` 中的 `generationVerified: false` 表示该命令只检查模型目录；实际成功生成的结果以 `image:generate` 返回和已保存图片为准。

## 逐件批量生成与参考证据

本地完整用法维护在原 Skill 的 [LOCAL_EXECUTION.md](../.claude/skills/visual-production/references/LOCAL_EXECUTION.md)。执行入口：

```bash
node scripts/image-cli.ts batch --manifest /absolute/material-jobs.json --state /absolute/batch-state.json --concurrency 4
```

清单逐件写 `id`、`prompt`、本地 `references`，以及需要时的 `dependencies` 和 `referenceTasks`。最多 4 个独立就绪任务并行，完成一件即补位。上游失败/未知只阻断依赖项；作为参考的生成上游先完成实际视觉检查并登记与输出哈希绑定的审核，未审核的下游为 `waiting_review`，不阻止独立项。再次运行同清单与状态文件复用成功项，不自动重复失败或未知计费项。

批量状态保存原始参考文件路径与 SHA-256；provider 的 `referenceInputs` 记录实际送出的参考图片字节哈希、格式与大小，包括预处理后的变化。两层记录通过同一参考索引关联；请求里有真实 `input_image` 才能称为附图生成。此证据不能证明模型完全遵守参考，也不替代身份与排版检查。

## 速度与实测

- GPT-5.5 显式发送 `reasoning: { effort: "low" }`。这是[官方模型指南](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5)建议低延迟工具调用优先评估的设置；代理是否执行该设置、实际提速多少仍需用真实请求测量。兼容性问题可设 `IMAGE_REASONING_EFFORT=auto`，不自动改模型或重发。
- 普通超大参考图按比例缩至长边 2048；长宽比超过 3:1 的长图保留尺寸。非透明图片尝试 JPEG 质量 90、4:4:4；透明图片保留 PNG；压缩结果更大、动画或解码失败则原样发送。不会裁剪、改写原文件、删除参考图或截断提示词。
- 酷态科联名的三张参考图，本地预处理约 140ms，图片总字节从 2,752,524 降至 1,181,787，减少 57.07%；这组三张都保持原尺寸。这个数字是上传体积改善，不能当成模型生成速度提升。
- 增量处理流式事件。收到 `response.completed` 或 `[DONE]` 后立即校验完整已收数据并交图；如果只收到包含最终图片的 `output_item.done`，默认等待最多 1 秒尾部，再校验并保存。局部预览不触发收尾。
- CLI 在 stderr 输出阶段与耗时，最终 JSON 留在 stdout；工作台更新当前图像请求的阶段。仅显示实际收到的阶段，没有估算百分比。

成功素材和失败记录都带 `diagnostics`：本地准备、请求、总耗时，上传/响应字节，以及首次阶段、生成开始、最终图片和响应完成事件的时间。`uploadFinishedMs` 表示本地请求流已写出，不保证远端已接收；`headersReceivedMs`、其他请求阶段时间都从开始 POST 计时。CLI 进程启动及 CPA 凭证解析时间不在其中。没有上游队列遥测时，不能将首响应等待精确拆成排队或推理。

`completionReason` 区分响应完成、流结束、图片尾部等待结束、HTTP 结束及断流保留；`responseCompleted` 仅标记是否观察到 `response.completed` 事件。`image_tail_grace` 确认的是已收到的最终图片，不宣称顶层响应已完成。关闭连接之后的事件无法观察；需要等待完整响应的调用可将 `IMAGE_FINAL_IMAGE_GRACE_MS=0`。在交付前已收到的失败、incomplete、不同的多张图片仍阻止成功。

本地挂流回归测试：模拟图片已完成但 HTTP 永不结束，完整响应事件即时交付，只有最终图片时在测试设置的 60ms 尾部窗口后交付，而不是等 1000ms 测试超时。

2026-09-05 用户授权的真实单张测速（同一 compact prompt、三张来源参考图、3:4 / 2K）：准备 148ms；POST 本地写出结束 119,891ms；收到响应头 159,507ms；收到生成开始事件 161,119ms；收到完整图片 256,610ms；从 provider 开始到保存总计 257,788ms。`completionReason=image_tail_grace`，未观察到顶层 `response.completed`，但最终图片已完整校验保存，证实提前收尾生效。结果与输入 SHA-256 记录在 `../outputs/brand-toy-prompts/cuktech-hok/generated-speed-test/speed-report.json`。

这一次应用交付时间约 4 分 18 秒，比旧成功图观察到的约 13 分钟减少约 67%；旧轮两张并发、本轮单张，且推理/压缩/收尾同时改变，不能当成严格 A/B 测试或保证后续固定提速。1.58 MB 请求写出耗时约 120 秒值得继续排查，但仅凭客户端时间无法确定是网络、代理背压还是其他原因。

## 后续接入服务或 Agent 工具

```ts
import { loadImageConfig } from './src/providers/image-config.ts';
import { OpenAIImageProvider } from './src/providers/openai-image-provider.ts';

// 宿主自行加载服务端环境变量。复用一个 provider 实例。
const provider = new OpenAIImageProvider(loadImageConfig());

// 由宿主验证用户选择、设计版本、RenderPlan、审核报告与预算后再调用。
const asset = await provider.generate({
  prompt: renderPlan.hero.prompt,
  negativePrompt: renderPlan.hero.negativePrompt,
  ratio: '1:1',
  references: authorizedReferenceDataUrls,
});
```

`references` 接受宿主从已授权素材解析出的 data URL，不接受 Agent 指定 endpoint、Key 或输出目录。`referenceDataUrl(buffer)` 可将本地素材 bytes 校验并编码。`generate` 每次只发一个请求，同一 Node 进程的所有 provider 实例共用最多 4 个在途请求的队列，第 5 个等待空槽。不同 CLI 进程不共享该队列；整套物料通过一个 `batch` 命令提交，不能启动四个各带四槽的进程冒充总并发 4。单批可用 `--concurrency 1` 到 `4` 服从更小限额，并发数不增加用户授权的制作数量或预算。

这个适配器不等于已经注册的 `mcp__collider__image_generate`。现有[工具契约](../contracts/CONTRACTS.md)中的身份、版本、用户选择、审核、限额及幂等守卫仍需由宿主实现，然后将这里返回的真实素材登记进任务状态。此轮没有新增 HTTP 服务、网页、Agent SDK 运行时或海报渲染器。

## 失败与恢复

仅提取 Responses 的最终 `image_generation_call.result` 或顶层兼容 `data[].b64_json`，不把局部预览、输入图片或任意 URL 当作最终结果。校验 base64 与 PNG/JPEG/WebP 文件签名；这不是图像内容审核或完整文件解码验证。

所有请求均不自动重试。超时、断流、HTTP 408/499/5xx、缺少最终图片等返回 `generationStatus: unknown`，因为上游可能已经处理和计费；明确 HTTP 拒绝或上游失败返回 `failed`。若断流或超时前已经完整接收到最终图片，且已收数据中没有明确失败或 incomplete 事件，则保留这张图片并返回成功。错误输出包含固定错误码、本地请求 ID、状态和耗时诊断，不包含上游原始错误体、Key 或请求内容。

发送前先确认输出目录可写并保存 `request.json`；成功后保存 `image.png`（或相应格式）及 `asset.json`，移除在途记录。失败保留 `request.json`。如果进程被强制结束而留下 `pending`，按状态未知处理。先通过请求 ID 检查供应商记录，再决定是否手动重发，不能仅根据本地失败提示判断未计费。单张调用记录用于排查；批量执行另用持久状态与锁处理恢复，未知结果仍不自动重发。

## 验证命令

```bash
# 安装运行与开发检查依赖。
npm ci
npm run typecheck
npm test
python3 scripts/validate_bundle.py
```

单元与集成测试使用内存数据和 loopback 模拟服务，不使用真实 Key，也不消耗生图额度。真实网关验证记录见 [CHECKS.md](../CHECKS.md)。
