# 本地真实参考与四并发执行

适用于拥有本地文件、网页和图像读取能力的宿主。来源和真实性判断遵守 [VISUAL_EVIDENCE.md](../../brand-profile/references/VISUAL_EVIDENCE.md)。工作流 1.6.1 同时支持本项目网页自动链路与独立本地脚本；两条路径共用采集和批量执行能力，不是新的 MCP 合约，受控 Agent 不因此取得任意 shell 权限。

## 采集与就绪

### 网页宿主自动执行

实时网页在开始协作时提交 `autoProduce: true`。Node 宿主从研究开始并行派发双方素材发现；CLI 返回实际观察的公开来源页及可见的 PNG/JPEG/WebP 原图地址；若实际搜索已找到来源页但网页工具未显示直链，保留来源页并令 imageUrl 为空，宿主从该页真实 HTML 的 img、og:image、srcset 中提取候选，不能猜测页面脚本/API或 CDN 路径。随后宿主调用原采集器下载来源页与图像，保存原件、地址重定向、日期、哈希和尺寸。随后以真实图像附件调用 CLI，结合来源页内容核对发布者、页面与图片关系、主体和具体版本。候选仍需按内容核对：官网通用分享图不等于具体新闻、角色或服装依据。当前自动采集以真实公开页面中可观察且可下载的图像为入口；不承诺自动登录、绕过访问限制或网页截图兜底。

第 1–2 步文字研究与双方初始采集并行，进入第 3 步创意提出前汇合初始来源、实际附图核对结果或局部缺口。创意据此采用真实可辨认资产；没有来源的部分明确为缺口，不阻止文字创作，也不增加第十步。第 6 步提交统一设计及 MaterialPlan 后，宿主立即按计划有界补采，与第 7 步文案及第 8 步逐件提示词制作并行；待正式提示词和补采支线均完成后再绑定参考，默认制作 core 与 recommended，optional 保留候选。出图前检查通过后，由同一宿主调用 `runImageBatch`，最多四个生成请求在途；一件就绪即启动、释放一槽即补位，不等待整组完成，也不另开四个脚本进程。逐件生成后进入独立验图队列，默认最多 2 个 CLI 同时对照本次参考与结果，不占用 4 个生图槽；等待中的共用参考图优先于无下游引用的效果图，只有实际通过且哈希一致的共用图可给依赖项使用。状态持续保存并供网页画布展示，第 9 步汇总真实证据。原始参考图数量上限和四个生成槽位分别管理。

参考绑定中的 referenceTasks 是未来生成图的依赖声明，可以指向尚未生成的有效上游任务；宿主会等待实际验收后取文件。不能因尚无产图而清空必要依赖，也不能为了并行把真实共用图依赖删除。

补采围绕本轮制作物料的实际缺口开展：已核对的同一版本不重复检索，明确留白或后期置入的 Logo 不为当前生图补采，optional 候选不扩大搜索范围。补采调用传当前方案和已核对参考，不重复携带完整初始品牌资料；这项范围约束不等于宿主已经能自动判定所有语义缺口并取消整次检索调用。

提前补采只复用同一版计划的来源任务，不冻结尚未生成的提示词或绑定；第 8 步仍按正式提示词、当前文件哈希和实际核对记录完成绑定。暂停后保留原图并补足未完成的查看；计划变化使用新版本。

同版预检通过后，若选中物料全部明确失败或依赖阻塞且零产图，宿主保留预检依据与逐项失败原因后暂停，不再调用第 9 步重复审查同一份文字；未生成的图片不能通过验收。有任何产图时正常总审，状态未知或未通过预检的情况保留原处理。

只有这个明确启用的网页分支会自动串起上述任务。历史记录没有 autoProduce 或为 false 时保持单图入口；独立运行下文脚本不会自动创建网页节点。只有文字能力、缺少真实附图能力或未配置图像服务时，报告实际能力缺口，不把文字结果当成视觉验收，也不静默更换用户所选模型。

### CLI 实际看图与保存证据

宿主构造 `AgentTask.images`，逐项提供可信素材登记中的绝对路径、SHA-256 与标签。适配器在读取前拒绝远程地址、非普通文件和最终路径符号链接，验证文件大小、PNG/JPEG/WebP 完整解码、像素限制及哈希，再把原字节复制到本次隔离 run 目录。普通 CLI 核查最多 12 张图片、每张 12 MiB、总计 48 MiB；这不是下游生图服务的参考图限额。

- Grok 素材发现使用 `streaming-json`，从 CLI 实际 available_commands、tool_call/tool_call_update 和最终 end 事件核对工具是否真正执行；没有网页执行事件的结果不采用，最多做一次保持网页权限的恢复。两次仍未执行则报失败；每次进程有独立 runId、目录、生命周期和 discovery-evidence.json，不拿模型自报字段当执行证据。
- Grok 看图使用 `--prompt-file <run>/prompt.json`，文件内是 ACP 内容块 `{type:"image", mimeType, data:base64}`，模型真正接收图像内容。看图任务保持 `--tools ''`、`--deny '*'`、`--disable-web-search`；素材发现才开放 `web_search,web_fetch`，不开放文件或代码工具。
- Codex 使用 `--image <冻结图片路径>`，首次调用与 `exec resume` 均实际附图；素材发现显式启用 `--search`。这些专用任务禁用 shell、插件、外部应用、子 Agent 与生图等无关能力，沿用只读沙箱和指定模型。
- run 目录保存实际冻结图片、`attachments.json`、任务、Schema、结构化结果与执行元数据。附件清单含哈希、标签、尺寸和本次路径；Grok 的 ACP 文件保留真正送入的图像内容。路径文本、哈希验证和模型口头说“已看图”均不能单独代替真实附图。

来源核查和成图审查分别记录输入/输出哈希、可见观察与局限。真实来源身份、已看过、已送入生图、生成成功、最终通过分别判断。下文的独立 batch CLI 没有自动视觉审查回调时，需要按“共用图检查”章节登记真实检查后恢复；网页宿主已连接该回调，无需人为为每个成功项再点一次。

### 本机 DNS 与采集边界

采集器继续禁止私网地址并固定连接 IP、验证目标域名 TLS。仅当系统对公开域名返回的全部答案均为 Clash 的 198.18.0.0/15 合成地址时，宿主使用固定 Cloudflare DoH，以 1.1.1.1 为 bootstrap 并验证其证书，重新取得公有 IP 后继续原校验和 pin。混合答案、其他私网/保留地址、无效 DoH 或证书失败仍拒绝，不退回合成地址，不改全局代理、DNS或安全检查，也不提供任意 resolver 覆盖。网络路径失败按具体素材保存缺口。

### 独立采集脚本

从原始发布页取得已观察到的图片地址，用 brand-profile 的 `scripts/collect-visual-reference.ts` 下载并保存来源记录；真实文件必须实际打开核对身份和版本。采集成功只证明文件已取得，不能自动提升为官方来源、已获授权或视觉检查通过。图片未查看或身份不明时，先补证，不将它投入要求准确身份的图像任务。

```bash
node .claude/skills/brand-profile/scripts/collect-visual-reference.ts --source-page '已实际读取的来源页URL' --image-url '已观察图片URL' --subject '具体主体' --version '已采用版本' --source-class official --output /absolute/references
```

脚本保存 `reference.json` 与原始图片。清单中的读取日期、文件哈希和尺寸分别对应其 `retrievedAt`、`contentHash`、`width` / `height`；来源页和图片重定向后的地址也单独保留。`sourceClass` 是输入声明，`sourceClassVerification`、`sourceRelationship`、`visualInspection`、`identityVerification` 初始均为 `unverified`；实际查看后的观察与出处核验另存证据附件，不能把 CLI 退出成功当作这些检查已通过。脚本不自动搜索、登录或执行网页中的命令。

将逐件设计、已查看的真实参考映射与当前制作范围转为批量清单。完整模板可按下方字段创建；`id` 使用本轮稳定 materialId，任务只有一个产物目标。原始身份源继续保留，生成的共用主图只作已验收概念的一致性依据。

总交付清单持续保留全部约定物料及待补素材状态；执行 manifest 只纳入真实文件已就绪的项目及其可执行依赖。不要把未下载文件的占位路径塞进 manifest，执行器会在付费前拒绝整份无效输入。待补版本的物料留在交付清单，补齐后按新批次/版本加入；不能因此遗漏它或把未生成项算作完成。执行器校验文件和调度，不自动核验品牌身份或查看记录，这些由主控按实际证据把关。

## 一份清单，一条队列

从本项目根目录执行（也可将脚本替换为其绝对路径）：

```bash
node scripts/image-cli.ts batch --manifest /absolute/material-jobs.json --state /absolute/batch-state.json --concurrency 4
```

批量命令会发起本轮已授权的真实计费请求。`--concurrency` 为 1–4；未知供应商限额不构成额外预算，供应商限制更低时降低并发。不要启动多个并发批次或 CLI 进程来突破这个上限。单个 Node 进程内所有 provider 共用 4 槽；不同进程不共享队列。四个子 Agent 不是四并发的前提。

清单格式（其中路径与提示词必须替换为当次真实、已查看和已设计的内容）：

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "core-product",
      "prompt": "本轮核心产品的完整已定设计、身份保留点、展示角度与禁止项",
      "ratio": "4:3",
      "references": ["references/official-product.png", "references/official-identity.png"]
    },
    {
      "id": "independent-poster",
      "prompt": "独立发布画面的完整设计与文案，说明每张参考的用途",
      "ratio": "3:4",
      "references": ["references/official-identity.png"]
    },
    {
      "id": "product-in-scene",
      "prompt": "沿用已检查核心产品的具体外观，在本轮指定使用场景展示",
      "dependencies": ["core-product"],
      "referenceTasks": ["core-product"],
      "references": ["references/official-identity.png"]
    }
  ]
}
```

`references` 只接收本地文件路径，相对路径基于 manifest 所在目录；不接远程 URL 或内嵌 base64。每件合计最多 4 张（本地文件与 `referenceTasks` 之和），这是模型附件上限，与生成并发上限独立。当前支持 PNG/JPEG/WebP，每张最多 6 MiB；准备超限素材时保留原件与衍生关系，重新查看，不能静默舍弃必要身份参考。

`dependencies` 规定先后关系，`referenceTasks` 还会读取指定上游真实生成文件并实际附图，必须是 dependencies 的子集。只有上游生成成功且完成下方检查登记，下游才就绪。不依赖上游图的独立任务继续填满空槽；无需为了凑满 4 个而添加范围外物料。

## 共用图检查后继续

作为下游参考的共用图生成后，用宿主图像读取工具打开原始身份参考和输出图，按 VISUAL_EVIDENCE 逐项比对。把实际观察、工具/记录位置与限制写进检查证据，再登记（此命令不执行视觉检查，也不需要再次向用户申请已授权范围内的检查许可）：

```bash
node scripts/image-cli.ts review --state /absolute/batch-state.json --task core-product --output-hash ACTUAL_OUTPUT_SHA256 --evidence '实际打开的原图与结果、身份/结构比对结论及检查记录位置' --review-status approved
```

发现身份或设计问题时登记 `needs_revision`，按用户/宿主范围修复受影响图，不能为了释放队列填写虚假 approved。没有实际图像读取能力时保留未检查，并报告具体缺口。

运行 batch 时，其余任务已结束、剩下的只等待共用图检查，则状态保存为 `waiting_review` 并返回；这不表示需要品牌方再次批准。完成检查登记后，用原 manifest 和原 state 重跑，已成功项复用，依赖项才继续。检查绑定输出哈希，文件改变后旧结论不得沿用。

## 证据、失败与恢复

每件结果随完成保存，不等全批结束才落盘。状态记录原始参考路径/哈希、实际引用的上游任务、生成返回文件与哈希。provider 的 `referenceInputs` 按索引记录真正发送的参考图哈希/格式/大小；预处理后的哈希可以与原始文件不同，两层证据都保留。不得声称供应商回执证明模型完全采纳参考。

同清单/同状态重跑时复用成功项；清单或原始参考内容变动会拒绝静默复用旧状态，先按影响范围建立新版本。`failed`、`unknown` 及其受阻下游不自动重发；进程中断遗留的 running 视为 unknown，先用 requestId 核查结果与计费。不能复制清单或删除状态来伪装成首次生成。

unknown 在确认终态前持续占用并发名额；其余空槽仍可用于独立就绪项，名额全被未知请求占用时保存为 `waiting_capacity`。先从实际供应商记录核对原请求，取得终态和真实输出后再登记，不能把一次超时直接当作 cancelled：

```bash
node scripts/image-cli.ts reconcile --state /absolute/batch-state.json --task core-product --outcome succeeded --asset-file /absolute/recovered-image/asset.json --evidence '已核对原请求ID的终态与返回文件，实际核查记录位置'
```

确认失败或取消时使用 `--outcome failed` 或 `cancelled`，省略 `--asset-file`。命令只保存核查证据、验证真实文件哈希和请求关联，不联网、不补发。恢复成功后，原来从未提交的下游依赖重新评估；若将该图作为参考，仍先完成视觉检查登记。已经提交过的 failed/unknown 项不因核查或重跑变成自动重试。常驻宿主对应接口为 `reconcileImageBatchUnknown`；同一进程的 provider 隔离名额由该接口同时释放，独立调用 provider 的宿主可用 `reconcileUnknownImageRequest`，均需实际终态证据。

state 文件有排他 `.lock`。遇到锁先检查记录中的进程是否还在运行，不能删除活跃锁；进程确已结束时才移除遗留锁，再以原状态恢复和核查未知项。源图/输出文件丢失或哈希改变时报告具体错误，不将旧成功标记当成文件仍有效。

执行成功、检查通过和进入画布是不同状态。单独执行 batch CLI 持久保存结果与进度，不会自动给网页创建新节点；本项目 autoProduce 网页分支由宿主直接调用同一执行器并保存逐件状态、检查结果与可访问图片，再更新画布。其他宿主通过其实际导入/登记能力展示，不能编造画布、assetId 或审核成功。
