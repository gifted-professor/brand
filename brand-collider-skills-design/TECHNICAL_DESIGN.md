# 联名碰撞器技术设计
## Skill 驱动的可组合实现 · V1.0

版本：1.0 · 日期：2026-09-05 · 状态：开发设计稿

**产品定义：输入两个品牌和可选目标、限制，内部赛马后交付成熟联名方案；确定后续出图方向后，生成产品效果图、海报和文案，支持自然语言修改与保存。**

2026-09-05 创意流程更新：内部默认十二个候选，评审与改写后交付一至三个成熟方案，不凑数。以 [collab-ideation](.claude/skills/collab-ideation/SKILL.md) 和 [赛马方法](.claude/skills/collab-ideation/references/TOURNAMENT.md) 为准；本文以下“三个方向”是早期流程描述。文档更新不代表网页协调器已实现结构化候选池和独立评审。

**实现原则：一个创意导演 Agent，多项可组合 Skill，少量受控工具，一份可追溯的项目状态。**

本文将“可塑造性”具体定义为：可替换创意方法、可切换视觉风格、可添加作品类型、可更换模型供应商、可只修改局部结果。第一版不建设通用 Agent 平台。

交付说明：本包提供技术文档、六个 Skill 模板、契约说明、配置样例与验收用例。2026-09-05 已补充可运行的 Image 2 生图适配器和 CLI，详见 [API 接入说明](docs/IMAGE_API.md)；Agent 运行时、文本模型、受控工具处理函数、数据库、worker 和网页仍需开发。示例业务接口均是本项目约定；不应当作某个 SDK 自带函数。

---

## 1. 范围与交付

### 1.1 第一版做什么

用户流程固定为：

```text
输入两个品牌、目标、条件
          ↓
生成三个不同的联名方向
          ↓
用户选定一个方向
          ↓
形成设计规格，检查条件
          ↓
产品主图 + 联名文案 + 复用主图的海报
          ↓
一句话修改 → 只重做受影响部分
          ↓
保存结果、下载图片、复制文案
```

包装首先体现在产品效果图中；海报复用产品主图。角色气泡由创意结果附带的 `dialogue` 提供，不增加品牌聊天系统。

第一版不做：品牌广场、真实合作方推荐、认证和商务撮合、支付、公开作品社区、自由社交、多 Agent 自主谈判、视频生成、三维建模、包装生产文件。

### 1.2 输入边界

碰撞器接受队友提供的品牌资料快照；也可以接受用户填写的信息。只有品牌名称但缺少可靠资料时，先查询已接入的品牌资料模块；仍无法识别，则返回待补充项，或在用户明确选择后使用演示假设。

任意名称可输入，不代表系统可以凭空知道任意品牌的资源和合作意愿。首版不在碰撞器内另建全网爬虫。公开资料检索以后可以独立接到 `brand-profile`，而不改变后面的契约。

### 1.3 三个成功标准

功能成功：一个未预生成成品的组合，能从输入走到可下载作品。

创意成功：结果说得清双方分别贡献什么，且不是只把两个 Logo 放在一起。

修改成功：只改文案不重画产品；改实物条件则更新方案、图片和相关文案，不继续展示已失效的结果。

---

## 2. 架构：Agent 做决策，Skill 装方法，Tool 执行动作

```text
团队主站 / 简单表单
       │ HTTP
       ▼
任务服务：身份、状态、版本、限额、持久化
       │
       ▼
单个创意导演 Agent（按任务建立上下文）
       │ 按需读取 Skill；选择当前需要的能力
       ├── brand-profile       品牌资料整理
       ├── collab-ideation     联名创意
       ├── design-spec         设计规格与设计修改
       ├── campaign-copy       故事、标题、宣传文案
       ├── visual-production   主图提示词与海报制作
       └── quality-review      方案及视觉检查
       │
       ▼
受控工具：读取资料 / 提交产物 / 生图 / 海报合成 / 读取图片
       │
       ▼
模型适配器 + 模板渲染器 + 数据库 + 素材存储
```

“一个 Agent”指一个角色与运行入口，不是让所有用户共用一段聊天，也不是必须让一个进程永远运行。每个任务用已保存的项目快照恢复上下文，不依赖完整聊天记录。

### 2.1 三层不能混淆

| 层 | 放什么 | 不放什么 |
|---|---|---|
| Agent | 当前任务、能力选择、调用顺序、失败后的有限调整 | 长篇品牌知识、全部设计方法、密钥 |
| Skill | 触发条件、操作方法、输入输出、示例、质量标准、所需资源 | 用户身份授权、任意系统权限、真实任务完成状态 |
| Tool / 后端 | 模型 API 调用、图像合成、文件读取、结构校验、限额、存储 | 品牌联名的完整创意方法 |

Skill 是包含说明和可选资源的能力包，不是一个自动执行的 API。运行时必须支持发现和加载，Agent 也必须获得真实可调用的工具。[S1][S2]

例如，`visual-production` 负责决定画什么、怎么表现；`image_generate` 才真正调用生图模型。仅在 `SKILL.md` 写“生成图片”不会自动产生图片。

### 2.2 流程可塑，但保留必要关口

不把每一次模型调用写死为六个顺序函数。Agent 可以根据任务跳过不需要的 Skill，也可以在检查失败后重新调用设计 Skill。

但后端必须保留三个不可跳过的关口：未选择方向不得付费出图；设计硬条件未通过不得出图；旧版本产物不得覆盖新版本。灵活性不等于让 Agent 自己决定权限和预算。

---

## 3. 默认技术实现

| 部分 | 本文默认方案 | 选择理由 |
|---|---|---|
| 后端 | TypeScript + Node.js，复用团队服务 | 与已有碰撞器方向一致，不另起语言栈 |
| Agent 运行时 | Claude Agent SDK，包在 `AgentRuntime` 适配器后 | 官方支持文件系统 Skill 和自定义工具；避免首版自建完整 Agent 循环 |
| Skill 包 | `.claude/skills/<name>/SKILL.md` | 当前默认运行时的项目级放置方式 |
| 数据契约 | JSON + JSON Schema 或 Zod | 前端和存储使用结构化产物，不解析自然语言段落 |
| 生图 | `ImageProvider` 接口，先实现一个供应商 | 品牌创意和 Skill 不绑定具体模型 ID |
| 海报 | 固定模板 + Sharp 等图像合成工具 | 复用主图、准确排字，不再次随机生成产品 |
| 存储 | 本地验证用 JSON/目录；部署复用团队数据库和对象存储 | 不为此模块另建整套平台 |
| 执行 | 常驻 worker，或团队已有可靠任务服务 | 用户选择后结束当前任务，下一步创建新任务 |

这是本文的默认选型，不表示团队已经决定或已经接通。如果现有 Agent 运行时具备工具调用和 Skill 加载，可复用它；保持产物契约与工具边界，替换 `AgentRuntime` 适配器即可。更换底座仍需验证工具权限、资源读取与结构化输出的兼容性，不承诺零成本迁移。

Claude Agent SDK 的 Skill 加载、目录及选项以官方文档为准；部署时只启用受信任的项目配置，不加载开发者个人 Skill 目录。[S3] 自定义工具可包装为同进程 SDK MCP server，无须另部署一个远程 MCP 服务。[S4]

本方案不采用 `Bash` 执行任意命令。Skill 使用已注册工具；确有脚本需求时，由工具处理函数调用受审核的脚本。模板中的 `scripts/` 是可选项，不为凑结构而放空脚本。

---

## 4. 六个核心 Skill

| Skill | 主要输入 | 必须产出 | 何时调用 |
|---|---|---|---|
| `brand-profile` | 两份品牌输入、资料来源、资源声明 | `BrandProfileSet` | 首次资料不完整或品牌资料改变 |
| `collab-ideation` | 品牌档案、目标、条件 | `ConceptSet`：三个方向及模拟对话 | 第一次生成，或改变品牌/核心营销目标 |
| `design-spec` | 选中方向、条件、可选旧规格与修改指令 | `DesignSpec` | 选定方向，或修改产品、包装、配色、材料 |
| `campaign-copy` | 当前设计规格、语气偏好 | `CopyPack` | 初次制作；修改故事、标题、宣传语 |
| `visual-production` | 当前设计、文案、风格包、模板 | `RenderPlan`，然后通过工具获得素材 ID | 首次出图；视觉变化；海报重排 |
| `quality-review` | 当前条件、设计、文案、实际图片（如已有） | `ReviewReport` | 出图前检查设计，出图后检查实际作品 |

### 4.1 brand-profile：整理事实，不制造品牌事实

拆分为输入事实、AI 解释和未知项。每个事实引用输入资料的 `claimId`，不把“演示设定”“用户自报”提升为已核验事实。

资源必须保留上游 `resourceId`、来源和确认状态。没有输入预算或门店资源，就保持未知。品牌特点用于提出创意，不生成假销售额、假联系方式或假授权。

### 4.2 collab-ideation：产生真实差异的三个方向

每个方向回答：产品或体验是什么、消费者为什么参与、A 贡献什么、B 贡献什么、各自可能获得什么、与另两个方向有什么实质区别。

三个方向不是同一产品换三个名字。优先符合明确硬条件；如果不能提出三个合理方向，返回原因和待补充信息，而不是靠忽略条件凑满。

附带的 `dialogue` 是 AI 角色模拟和决策摘要，不是品牌真实观点，也不是模型私有思考过程。

### 4.3 design-spec：把创意变成唯一制作依据

固定产品名称、组件、材料、颜色、视觉元素、构图、禁止项、双方贡献和待确认事项。

每个实物组件必须声明是否新增实物、是否新增印刷；声称复用已有物料时必须引用输入资源 ID。未知不能自动视为满足硬条件。

自然语言修改由本 Skill 更新结构化数据。新的硬条件以用户本次请求为依据；Agent 不得为让方案通过而偷偷删除或放宽旧条件。

### 4.4 campaign-copy：同一产品，不同表达

生成标题、宣传语、联名故事、海报文案和社交分享文案。不得新增设计中没有的赠品、材质、价格、活动日期或合作承诺。

只改文案时，产品规格保持不变；文案引用具体设计产物的 ID 与哈希。

### 4.5 visual-production：先规划，再调用真实工具

将规格转为主图提示词和禁止项；风格包只影响表现方式，不推翻产品条件。先提交 `RenderPlan`，再调用 `image_generate`；获得真实主图 ID 后调用 `poster_compose`。

海报使用同一张主图，不再次生成一个相似产品。需要精确的标题、标识和说明由模板合成；Sharp 提供图像叠加能力，可用于这类处理。[S6]

未提供可用标识素材时采用品牌文字展示或省略标识，不编造后声称是官方 Logo。产品效果图仅用于概念讨论，不是生产文件。

### 4.6 quality-review：分开“写对了”和“画对了”

出图前，检查双方价值、硬条件、规格与文案一致性。出图后，读取实际图片，检查组件、颜色、文字与禁用元素。

没有视觉读取能力时，将视觉结论标为 `unverified`，转人工检查。不能只读提示词就写“图片审核通过”。同一个 Agent 的检查属于自检，不构成独立验证，也不能替代确定性规则和人工验收。

---

## 5. Skill 文件规范与复用方法

### 5.1 目录与字段

Agent Skills 规范要求 `SKILL.md` 包含 YAML frontmatter，其中 `name`、`description` 必填；`scripts/`、`references/`、`assets/` 为可选资源目录。[S1]

```text
collab-ideation/
├── SKILL.md
└── references/
    └── CONTRACT.md
```

```yaml
---
name: collab-ideation
description: >-
  根据两个品牌的档案、营销目标和限制，生成三个有差异的联名方向。
  用于首次创意碰撞或更换核心目标，不用于单纯修改海报文案。
compatibility: 需要本项目提供上下文读取和结构化产物提交工具。
metadata:
  version: "1.0.0"
  contract-version: "1.0"
---
```

正文依次写：任务边界、输入、操作步骤、必须遵守的规则、输出、失败时怎么办。不要把一个 Skill 写成“什么都能做”的总提示词。

`metadata.version` 和 `contract-version` 是本项目约定的元数据，不是规范自带的版本管理系统。工具名称和产物契约也需要应用实现。

### 5.2 按需加载，而不是把六篇说明全部塞进提示词

运行时先向 Agent 提供各 Skill 的名称和描述，激活后再读取正文，涉及参考资料时再读取对应文件。这是官方集成指南所描述的渐进加载方式。[S2]

主 Agent 的系统说明只定义角色、当前目标、全局边界、可用技能目录和完成条件。具体创意方法留在 Skill；品牌数据留在资料包；视觉偏好留在风格包。

### 5.3 三类内容必须分开

**通用能力 Skill**：如何分析品牌、如何联名、如何写文案。

**品牌资料 Brand Pack**：某个品牌的事实、资源、来源和已提供素材。通常是 JSON 或 Markdown 数据，不应每新增一个品牌就复制六个 Skill。

**风格包 Style Pack**：颜色倾向、构图、质感、参考素材和避用项。更换风格包不更改业务权限，也不自动获得标识使用权。

如果以后引入一个已有的品牌风格 Skill，先审查其许可证、依赖和脚本行为。它若只提供视觉规则，可以转为风格包；若确有可复用的设计步骤，再作为专项 Skill 接入。第一版不动态安装网络上的 Skill。

### 5.4 更新方式

修改创意方法：更新 Skill，运行固定测试，增加版本号。

增加品牌：新增资料包或接入上游档案，不改运行时。

增加海报样式：新增模板和预览数据，不改创意 Skill。

更换生图模型：实现新的 `ImageProvider`，声明支持的尺寸、参考图和编辑能力。

增加新作品类型：新增 Skill 或扩展既有 Skill，同时补充工具、契约、前端展示和测试；不是只增加一份 Markdown 就自动可用。

运行中的任务固定 Skill 版本与文件哈希。部署新版本只影响新任务；不做正在运行时的静默热更新。

### 5.5 上游案例研究

项目级 `../brand-case-research/` 负责导入报告、去重、断言核验、差异保留及案例检索。它在创作运行时之外维护 `../品牌物料/案例库/`，不加入六个创作 Skill 的受控工具白名单。历史案例与本次品牌资料分开存储。

本地脚本可生成带资料库版本、内容哈希、案例及证据状态的 researchContext。服务实现时按 brief 和当前能力检索，将该字段可选地加入 get_context；缺少案例库时原流程仍成立。历史资源不会自动成为当前 resourceId，公开图片不会自动成为 assetId，事实纳入 brief 仍经过上游核验和版本流程。现阶段已提供资料包生成能力，未实现服务端自动注入。

---

## 6. 数据契约：所有产物围绕同一份设计

### 6.1 CollisionBrief

```ts
// 本项目契约示意，不是 SDK 内置类型。
type Provenance = "provided" | "verified_public" | "assumption";
type TriState = "yes" | "no" | "unknown";

type Constraint = {
  id: string;
  level: "hard" | "preference";
  kind: "no_new_items" | "no_new_printing" | "no_gift_box" | "custom";
  text: string;
};

type BrandInput = {
  brandId: string;
  name: string;
  claims: Array<{
    id: string;
    text: string;
    provenance: Provenance;
    sourceRef?: string;
  }>;
  resources: Array<{
    id: string;
    label: string;
    status: "declared" | "unconfirmed";
    description: string;
  }>;
};

type CollisionBrief = {
  schemaVersion: "1.0";
  brands: [BrandInput, BrandInput];
  goal: string;                  // 没有目标时明确写“自由创意”
  constraints: Constraint[];
  stylePackId: string;
  deliverables: Array<"hero" | "poster" | "copy">;
};
```

`verified_public` 只能由上游核验流程提供，不能由创意 Agent 自行升级。已声明资源用于概念规划，不等于供应链确认。

### 6.2 DesignSpec 的最低字段

| 字段 | 用途 |
|---|---|
| `conceptId` | 指向用户选中的方向 |
| `product.name/category/description` | 固定产品身份 |
| `components[]` | 实际出现的组件、是否新增、是否印刷、资源引用 |
| `brandRoles[]` | 双方分别贡献什么 |
| `visual` | 配色、材料、图案、构图、避用元素 |
| `constraintsSnapshot` | 本次设计必须满足的完整条件 |
| `decisions[]` | 重要取舍及其对应条件 |
| `assumptions[]` | 本次概念使用的假设 |
| `pendingConfirmations[]` | 仍需人确认的执行条件 |

组件示例：

```json
{
  "id": "component-01",
  "name": "可拆书签杯套",
  "kind": "sleeve",
  "requiresNewItem": "yes",
  "requiresNewPrinting": "yes",
  "resourceIds": [],
  "description": "展开后可作为书签的纸质杯套"
}
```

如果条件是“禁止新增印刷”，这个组件不得直接通过。把 `requiresNewPrinting` 改成 `no` 但保留同样描述，也必须由语义检查识别。

### 6.3 产物封装由服务端生成

```ts
type ArtifactRecord<T> = {
  artifactId: string;
  projectId: string;
  revision: number;
  type: string;
  schemaVersion: "1.0";
  contentHash: string;
  parents: Array<{ artifactId: string; contentHash: string }>;
  producer: {
    skillName: string;
    skillVersion: string;
    skillDigest: string;
    modelId?: string;
  };
  payload: T;
  createdAt: string;
};
```

ID、项目归属、版本、哈希和生产信息由后端赋值。Agent 只能提交负载与父产物引用，不得自报“已授权”“审核通过”或伪造素材 URL。

`DesignSpec`、`CopyPack`、`RenderPlan`、`ReviewReport` 和图片分别保存。设计没有改变时，可在新项目版本中复用旧设计产物，但必须显式记录引用关系。

### 6.4 确定性规则

`no_new_printing`：组件字段为 `yes` 则阻断，为 `unknown` 则需要补充或改设计。

`no_new_items`：同样检查 `requiresNewItem`。

`no_gift_box`：检查组件类型与描述；类型检查由代码完成，描述矛盾交给语义检查。

声称复用现有组件：必须引用当前品牌资料中的合法资源 ID，不能凭空造 ID；引用存在仍不等于描述完全吻合，后者需要语义检查。

预算、真实制造能力等无法仅从输入验证的条件不得标为已满足，保留待确认项。JSON 合法只代表结构合法。

---

## 7. Agent 怎样真正使用 Skill

### 7.1 运行机制

任务服务取出项目快照、用户本次操作、允许使用的工具、Skill 固定版本，交给 `AgentRuntime`。

Agent 从目录选择需要的 Skill，读取正文及必要资源；随后读取项目资料、生成产物并通过工具提交。工具执行结果进入上下文，Agent 可进行一次有界修复，最后结束本次任务。

示意：

```text
用户：把海报文案改得活泼一点，产品别动

Agent 读取当前设计和旧文案
→ 激活 campaign-copy
→ 提交新 CopyPack
→ 激活 visual-production 的“只重排海报”路径
→ poster_compose 复用旧 heroAssetId
→ 激活 quality-review 检查修改范围
→ 保存新版本，结束
```

这条任务不需要重新调用品牌分析、三方向创意和生图。

### 7.2 默认 SDK 接入要求

使用官方项目级 Skill 加载配置；当前官方文档提供 `settingSources`、`skills` 等配置。具体 SDK 版本在实现时锁定并做启动测试，不能只依赖文档示例推断已加载成功。[S3]

本项目至少验证：能发现六个 Skill；能触发并读取目标 Skill；能调用自定义工具；无关 Skill 不加载；禁止工具确实被阻断。

自定义工具使用同进程 MCP 包装后，其名称类似 `mcp__collider__image_generate`。这是 SDK 的工具命名约定，不表示网上已经存在一个可直接调用的“collider”服务。[S4]

### 7.3 工具契约

| 项目工具 | 作用 | 服务端必须检查 |
|---|---|---|
| `get_context` | 读取当前 brief、选中方向、有效产物和状态 | 项目身份由任务上下文注入，不接受跨用户替换 |
| `read_asset` | 按素材 ID 读取当前项目图片；支持时返回可视图像 | 归属、类型、大小，不接受任意本机路径 |
| `submit_artifact` | 提交档案、方向、设计、文案、渲染计划或报告 | Schema、父引用、版本、来源、工具权限 |
| `image_generate` | 按已保存设计和 RenderPlan 生成主图 | 用户已选、当前设计可渲染、限额、幂等 |
| `poster_compose` | 按已保存主图、文案和模板制作海报 | 引用一致、文字布局、模板白名单 |

`get_context` 同时返回本次允许的 `stylePack`、模板元信息和相关产物。Skill 的本地参考文件通过受限文件读取能力访问，不通过任意网址下载。

`submit_artifact` 返回由服务端生成的 ID、哈希和校验结果。它是一个受类型约束的提交入口，不是让 Agent 任意写数据库。

`image_generate` 不允许 Agent 自选第三方端点、模型密钥或输出目录。供应商和模型由后端配置；返回的真实素材由后端保存并赋予 ID。

### 7.4 任务状态和素材状态分开

项目状态使用少量值：`running`、`awaiting_selection`、`needs_input`、`needs_revision`、`review_required`、`completed`、`failed`、`cancelled`。

运行阶段另外标注：`profiling`、`ideating`、`designing`、`reviewing`、`rendering`、`composing`。页面显示真实阶段事件，不播放伪造的完成消息。

图片有独立 `generationStatus` 与 `reviewStatus`。生成成功不等于视觉检查通过。缺少视觉检查时，作品可以作为待审核预览，但不显示“审核通过”，项目停在 `review_required`。

---

## 8. 修改、版本与重用

### 8.1 按产物依赖决定重做范围

| 用户改变什么 | 重新调用的能力 | 可以保留什么 |
|---|---|---|
| 只改宣传语、故事语气 | 文案、海报制作、相关检查 | 当前设计、产品主图 |
| 只改海报排版 | 海报制作、布局检查 | 设计、主图、未变的文案 |
| 改颜色、材料、产品结构 | 设计、检查、视觉，必要时文案 | 品牌档案、未失效的事实 |
| 新增“禁止印刷”等条件 | 更新条件、设计、检查，再按依赖重做 | 仍有效的品牌资料 |
| 更换品牌或核心目标 | 重新创意，再选方向 | 可复用的资料快照和素材（若仍相关） |

Agent 提出修改范围，后端根据真实字段变化复核。不允许 Agent 仅说“产品没改”就复用图片。

如果修改的是直接印在产品上的文字，该文字属于视觉依赖，主图不能按“只改文案”复用。

### 8.2 哈希用途

设计哈希包含完整设计负载。主图依赖哈希包含产品形态、配色、材料、图案、构图、与图像相关的条件、参考素材及风格包版本。

海报依赖包含主图内容哈希、文案、模板版本、尺寸和排版资源版本。哈希使用稳定序列化计算。

相同依赖可复用产物，但不承诺再次调用模型产生完全相同的图片。供应商、模型配置、生成参数另行记录；用户主动要求重新抽图时产生新的尝试 ID。

### 8.3 版本隔离

每次修改带 `baseRevision`。与服务端当前版本不同则返回冲突，不静默覆盖。

生图任务绑定项目、版本、设计哈希和幂等键。旧任务晚返回时可归档，不能移动最新作品指针。

外部 API 请求超时后，若不能确认是否已生成，标为 `unknown` 并优先查询供应商任务或等待人工处理；不能直接无限重试导致重复收费。应用幂等不等于供应商天然支持“恰好一次”。

---

## 9. 可塑造性配置

本包 `config/collider.config.json` 是应用配置样例，不是某个 SDK 的原生参数对象。

```json
{
  "schemaVersion": "1.0",
  "conceptCount": 3,
  "defaultDeliverables": ["hero", "poster", "copy"],
  "defaultStylePackId": "warm-editorial",
  "defaultPosterTemplateId": "poster-portrait-v1",
  "limits": {
    "maxAgentTurnsPerJob": 24,
    "maxToolCallsPerJob": 40,
    "maxAutoRepairRounds": 1,
    "maxBillableImageRequestsPerJob": 2
  }
}
```

这些限制是测试起始值，不是性能或成本承诺。后端按实际使用量调整；模型 SDK 限额和工具侧限额均需配置，不能只写在提示词里。

Skill、风格包和模板由团队在代码评审后加入白名单。第一版修改配置并重新部署即可，不做在线 Skill 商店和可视化流程编辑器。

### 9.1 技术扩展点

```ts
// 以下都是待实现的本项目接口。
interface AgentRuntime {
  run(task: AgentTask): AsyncIterable<AgentEvent>;
}

interface ImageProvider {
  capabilities(): {
    referenceImages: boolean;
    editing: boolean;
    supportedSizes: string[];
  };
  generate(request: ImageRequest): Promise<ImageResult>;
}

interface PosterRenderer {
  compose(request: PosterRequest): Promise<AssetResult>;
}
```

不兼容的模型尺寸或编辑能力由适配器提前拒绝或明确降级，不让 Skill 假定所有供应商相同。没有图片编辑能力时，可按新规格重生，但不得保证像素级保留。

---

## 10. 接口、存储与部署

### 10.1 对队友提供的接口

| 接口 | 请求重点 | 返回重点 |
|---|---|---|
| `POST /api/collisions` | brief、幂等键 | `projectId`、`jobId` |
| `GET /api/collisions/:id` | 当前用户身份 | 当前版本、方向、产物、待处理事项 |
| `POST /api/collisions/:id/select` | `conceptId`、`baseRevision`、幂等键 | 创作任务 ID |
| `POST /api/collisions/:id/revise` | 修改指令、`baseRevision`、幂等键 | 修订任务 ID |
| `GET /api/jobs/:jobId` | 当前用户身份 | 状态、阶段、错误、可用产物 ID |
| `POST /api/collisions/:id/review` | 当前产物引用、人工审核决定 | 新审核状态；Agent 不可调用 |

对外下载的主图和海报均显示概念标记；内部可以保留干净主图供排版，但不直接当作公开成品。图片下载通过现有受控素材服务，或返回有有效期的下载链接。UI 可以轮询任务状态，后续再增加事件流；首版不用 WebSocket 聊天。

### 10.2 最小持久化

`projects`：所有者、当前版本、brief、选中方向、项目状态。

`jobs`：任务类型、版本、阶段、限额、尝试次数、供应商请求 ID、错误。

`artifacts`：结构化产物、父引用、生产信息、哈希。

`assets`：对象存储键、媒体类型、尺寸、内容哈希、生成与审核状态。

可复用团队现有表，不要求单独数据库。局部失败保留已经成功的产物，例如海报排字失败不重新生图。

### 10.3 运行要求

网页请求只创建持久化任务，worker 执行 Agent；不能仅在短请求内启动一个不被等待的 Promise 就认为任务可靠完成。

每个任务只提供受信任 Skill 的只读目录和本任务可访问的数据。凭据由后端工具持有，不写进 Skill、提示词、日志或可读取文件。

运行日志记录激活了哪些 Skill、调用了哪些工具、消耗、耗时和错误类别；不需要保存或向用户展示模型私有思考内容。个人信息和敏感输入做最小化记录。

---

## 11. 权限与可靠性底线

### 11.1 不把 Skill 当权限系统

Agent Skills 规范中的 `allowed-tools` 属于可选且实验性的字段，跨运行时行为不统一。[S1] Claude SDK 的 `allowedTools` 是预批准机制，不是单独完整的访问隔离；官方权限文档也明确区分允许规则、拒绝规则、模式与 hooks。[S5]

本项目要求：工具注册范围受限；通用 Bash/Write/Edit 不开放；文件读取限制在受信任 Skill 和本任务资源；每个业务工具处理函数都检查项目归属、版本与限额。

如果需要对每次调用强制检查，使用运行时前置 hook 或工具处理函数，不能假定 `canUseTool` 在工具已被预批准后还会执行。[S5]

品牌网页、上传资料和图片内文字一律视为数据，不允许它们要求更换系统规则、读取其他项目或泄露凭据。第一版 Skill 由团队提交审核，用户不能把上传文件直接安装为可执行 Skill。

### 11.2 失败处理

结构错误：返回字段级错误，最多一次自动修复。

语义不满足条件：修改设计后重新检查，不进入出图。

素材生成失败：保留已完成设计与文案，展示具体阶段失败。

无法视觉检查：进入待人工审核，不伪称通过。

无法识别品牌：保留用户输入，明确请求补充资料，不编造。

超出限额：结束当前任务并展示可保留的部分结果，不无限循环。

### 11.3 作品标记

对外预览和下载结果标记“AI 概念设计 · 非官方联名”。这是一项产品透明度要求，不代表授权证明。是否适用于实际商业使用仍需相关主体确认。

---

## 12. 开发顺序与验收

### 阶段一：先让 Agent 真正调用 Skill

实现运行时适配器、`get_context` 和 `submit_artifact`。使用本包虚构品牌资料，跑通品牌整理、三个方向、选择后设计、文案与检查。所有中间结果保存 JSON。

此阶段可以使用明确标注的工具测试替身，但不能把它们算作真实生图完成。

验收：日志能证明对应 Skill 被加载；产物符合契约；没有调用与当前任务无关的能力；硬条件冲突能阻断。

### 阶段二：接一条真实视觉链路

实现一个生图适配器和一个固定海报模板。用同一张主图合成海报，保存真实素材 ID。模板文字需要测量、换行和安全边距，不盲目按字符数缩小字号。

验收：用户选定之后才产生付费请求；主图和海报产品一致；没有图片时不会伪造 URL；下载作品带概念标记。

### 阶段三：实现修改和主站集成

增加版本冲突处理、依赖重用、任务接口和真实状态展示。再把 `dialogue` 接到队友的小人气泡。

验收：只改海报文案时不生图；禁止新印刷后不继续用含新印刷的主图；旧任务不能覆盖新版本；刷新后可恢复。

### 12.1 必测用例

本包 `tests/acceptance-cases.json` 包含 12 个验收场景。它们是待执行用例，不是已通过的集成测试。

| 场景 | 通过条件 |
|---|---|
| 正常创作 | 三个方向可选，选中后有真实主图、文案和海报 |
| 仅修改文案 | 生图调用增量为零，产品身份保持一致 |
| 禁止新增印刷 | 规格不含违反项，实际图片检查通过或明确待审 |
| 礼盒禁用 | 被禁止组件不进入最终方案 |
| 未知品牌 | 返回待补充信息，无伪造事实 |
| 资源缺失 | 不接受凭空创建的已有资源 ID |
| 视觉能力缺失 | 标为未验证，不标审核通过 |
| 重复点击 | 同一幂等键复用同一任务 |
| 旧任务晚返回 | 最新版本指针保持正确 |
| 品牌资料夹带指令 | 不泄露凭据，不改变工具授权 |
| 更换风格包 | 不改核心流程即可影响视觉表现，硬条件保留 |
| 海报合成失败 | 保留主图和文案，仅重试合成 |

创意质量另外进行人工对照：相同品牌与条件、相近预算下，与直接通用提示词的结果比较“具体性、双向贡献、条件满足、修改一致性”。小样本结果用于迭代，不对外宣称算法已被证明有效。

---

## 13. 建议项目目录

```text
brand-collider/
├── agent/
│   └── SYSTEM.md
├── .claude/skills/
│   ├── brand-profile/
│   ├── collab-ideation/
│   ├── design-spec/
│   ├── campaign-copy/
│   ├── visual-production/
│   └── quality-review/
├── config/
│   ├── collider.config.json
│   └── runtime.example.json
├── contracts/
│   └── CONTRACTS.md
├── examples/
│   └── fictional-brief.json
├── styles/
│   └── warm-editorial.json
├── templates/
│   └── poster-portrait-v1.json
├── tests/
│   └── acceptance-cases.json
└── src/                         # 生图适配器已实现，其余为后续规划
    ├── runtime/                # Agent SDK 适配与任务上下文
    ├── tools/                  # 五项受控工具
    ├── providers/              # 已实现 Image 2 Responses 适配器、配置与结果解析
    ├── rendering/              # 海报模板渲染
    ├── jobs/                   # 任务、限额、幂等和阶段恢复
    └── api/                    # 对主站接口
```

第一轮开发目标不是让所有目录都有代码，而是跑通 `Skill → 工具 → 结构化产物 → 下一步`。不要创建暂时用不到的插件市场、分布式编排或多 Agent 通信层。

---

## 14. 可直接交给编码 Agent 的任务

请读取本技术文档、`agent/SYSTEM.md`、六个 Skill 及 `contracts/CONTRACTS.md`。实现联名碰撞器，不扩展品牌社交或商务撮合。

先锁定运行时依赖，验证受信任项目 Skill 能被发现、按需加载并调用受控工具。使用虚构品牌输入，通过真实 Agent 运行产生品牌档案、三个方向、设计规格、文案和审核结果；产物按契约保存。

随后接入一个真实生图服务和一个海报合成模板。工具处理函数负责身份、Schema、版本、限额和幂等。创意方法放在 Skill，不搬回 API 路由中的长提示词。

最后实现修改范围判断、依赖重用、旧任务隔离与主站接口。对照验收用例逐项报告通过、失败和未测试。工具不可用时返回真实错误，不能用预生成图冒充成功，不宣称真实授权或生产可行性。

最终交付：可运行服务、环境变量说明、锁定依赖、测试结果和一条真实端到端演示记录。

---

## 15. 官方参考资料与适用范围

文档核对日期：2026-09-05。以下资料支持 Skill 格式、运行时接入和图像合成能力；本项目的六项 Skill、产物契约、状态、工具、默认限额及开发阶段是本文提出的设计，不是官方标准自带功能。

[S1] Agent Skills — Specification。用于 Skill 目录、frontmatter、可选资源及实验性工具声明。

```text
https://agentskills.io/specification
```

[S2] Agent Skills — How to add skills support to your agent。用于发现、按需加载及资源访问机制。

```text
https://agentskills.io/client-implementation/adding-skills-support
```

[S3] Claude Agent SDK — Extend agents with skills。用于项目级 Skill 加载和 SDK 配置；实现时固定版本并核对。

```text
https://code.claude.com/docs/en/agent-sdk/skills
```

[S4] Claude Agent SDK — Give Claude custom tools。用于同进程自定义工具和命名方式。

```text
https://code.claude.com/docs/en/agent-sdk/custom-tools
```

[S5] Claude Agent SDK — Configure permissions。用于区分预批准、拒绝规则、hooks 和回调。

```text
https://code.claude.com/docs/en/agent-sdk/permissions
```

[S6] Sharp — Compositing images。用于海报图像叠加。

```text
https://sharp.pixelplumbing.com/api-composite/
```
