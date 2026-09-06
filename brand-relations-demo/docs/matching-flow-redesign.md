# 品牌匹配页面与动画说明 / Matching Flow & Motion

## 页面顺序 / Page flow

品牌资料 → 自动生成角色 → Gravity。顶部中央通过两个图标切换 Gravity 与抽卡。两种模式分别占据主页面。两边选中的伙伴都先进入同一详情页，再决定是否用联名预演建立联系。

Brand profile → automatic character → Gravity. Two centered icon buttons switch between Gravity and Draw. Both modes lead to one partner-detail gate before contact starts.

```tsx
type Page = 'entry' | 'intake' | 'matching' | 'detail' | 'next';
type Mode = 'gravity' | 'draw';

// App.tsx: conditional rendering mounts one primary surface at a time.
page === 'entry' ? <CharacterEntry />
  : page === 'intake' ? <BrandIntakePage />
  : page === 'detail' ? <PartnerDetailPage />
  : page === 'next' ? <CollaborationInvitation />
  : mode === 'draw' ? <DrawPage />
  : <GravityWorld />;
```

以上是省略 props 的结构示意；实际代码见 `src/App.tsx`。浏览器地址暂不承担页面状态，刷新回到角色入口。旧案例页仍在 `/?view=cases`，本次没有将它改为主页。

The snippet omits component props. Page state is currently held in React; refreshing returns to entry. The existing case library remains at `/?view=cases`.

## 如何理解参考动画 / Understanding the reference

参考：https://www.companypicnic.com/ 。2026-09-05 浏览器观察：首屏是角色群像与舞台构图，页面存在铺满首屏的 VIDEO 元素和 Mux 流媒体地址。因此能确认其使用视频媒体；不能仅凭这些观察断言全部底层动画实现。

Browser observation on September 5, 2026: a character ensemble on a stage and full-viewport video elements using Mux media. This confirms video usage, not the complete internal animation architecture.

本次借鉴角色登场的表现方式，首页右侧在现有虚构品牌角色之间轮换，并用模糊与问号保留不确定性。不依赖参考站的视频或人物素材。

The entry cycles through existing fictional brand characters with blur and an uncertainty mark. It does not embed the reference site's media.

```css
@keyframes character-arrive {
  from { opacity: 0; transform: translateY(40px) scale(.88) rotate(-5deg); }
  to   { opacity: 1; transform: none; }
}
@keyframes character-breathe {
  0%, 100% { transform: translateY(0) rotate(-1deg); }
  50%      { transform: translateY(-10px) rotate(1deg); }
}
```

外层容器负责 850 ms 入场，内层角色负责 5 秒轻微漂浮；未知品牌每 2.2 秒轮换。原有 reduced-motion 样式会关闭这些动画。

The outer wrapper handles the 850 ms entrance; the inner avatar handles a five-second float, and the unknown brand changes every 2.2 seconds. Reduced-motion preferences disable motion.

## 上传与资料 / Upload and profile

首次匹配仅要求品牌名称、品牌定位、已有产品/能力/资源。需求、目标、受众、气质、预算与交付边界、案例与依据均为选填。首页与上传页的虚构品牌体验入口已取消。页面支持填写或上传 64 KB 以内的 JSON、TXT、Markdown，并提供 JSON 模板。

First matching requires only a brand name, positioning and existing products/capabilities/resources. All other fields are optional. The fictional-brand bypass has been removed. The page accepts a form or JSON/TXT/Markdown up to 64 KB and supplies a JSON template.

上传内容在浏览器内解析。只有能识别的字段自动填入；无结构文字仅保留为“案例与依据”，不会被猜测为能力。提交后自动使用当前冻结的六部件角色规则生成一个结果，并保留完整匹配字段。

Parsing is local. Recognized fields fill the form; unstructured text remains evidence instead of being inferred as capability. Submission automatically selects one result from the frozen six-part character recipe and retains every matching field.

## 两种匹配模式 / Two matching modes

Gravity 继续使用已有关系评分、布局、平移和缩放。点击角色时，右侧只显示品牌名、简单概括、关系判断、评分维度与“选择这个伙伴”。顶部提供回到我的品牌和聚焦当前伙伴；一次只保留一个选中伙伴。中文资料映射到原有能力维度，公式和权重不变。

Gravity retains scoring, layout, pan and zoom. Preselection exposes only a concise evaluation. The owner identity remains separate from focus, and Chinese profile terms map into the existing dimensions without changing formulas or weights.

抽卡使用 Fisher–Yates 洗牌，从除自己以外的品牌里随机取至多三张，同一手不重复。每轮以 100 ms 错开完成发牌，点击后翻转 650 ms，放大弹窗展示品牌名称与文字资料，正面和弹窗均不显示角色。三张都可以查看；弹窗顶部直接切换卡牌，关闭后保留同一手牌和已翻状态。选择后进入和 Gravity 相同的完整详情页。重新洗牌允许后续轮次再次出现同一品牌。

Draw mode shuffles the eligible pool, excluding the owner, and deals up to three unique cards. Avatars appear only on the back. A 650 ms flip opens an enlarged text-only brand dialog. All three cards can be inspected; switching and closing preserve the hand. Later hands may repeat earlier brands. A draw is a discovery event, not consent or a validated success prediction.

本次不调整既有关系因子和权重。现有运行代码实际上是五个计分维度；此前讨论的六因子基线没有在本次页面改版中另行落地或替换。

This redesign does not change scoring. The current runtime has five scored dimensions; the previously discussed six-factor baseline is not newly implemented here.

## 匹配之后 / After discovery

选中伙伴 → 完整品牌资料与关系详情 → 建立联系 → 编辑带水印的联名预演邀请 → 对方独立接受、要求修改或拒绝 → 双方同意后解锁共创入口。

Select a partner → full detail → contact → edit a watermarked collaboration-preview invitation → recipient independently accepts, requests changes or declines → unlock the co-creation boundary after mutual consent.

详情页通过左上角关闭按钮返回匹配。只有点击“用联名预演建立联系”后才展示完整邀请草稿与三项诊断。当前页面仅模拟邀请、接收方视角和版本修改；不会实际发送，未接入图片 Demo 或实时群聊。COLLIDER 的原始运行时已接入完整文本提案生成，七个字段支持按需 AI 建议；真实生成需要服务端模型配置。

The detail page closes back to matching. Only the explicit contact action opens the preview draft and three diagnostics. Invitation, recipient view and revisions are local simulations; image Demo generation and live chat remain absent. The original COLLIDER runtime now powers text proposal generation and per-field suggestions, subject to server model configuration.

后续真实集成需增加用户身份、邀请与接受记录、每位参与方独立确认、项目持久化、共享讨论和 COLLIDER 项目交接。

Production integration requires identity, invitation and acceptance records, independent participant consent, persisted projects, shared discussion, and a COLLIDER handoff.

## 设计与验证 / Design and validation

概念图：`docs/design/20260905-matching-flow/concept.png`，使用内置 Image Gen 生成。提示要求四个协调页面：上传角色、Gravity、抽卡、合作确认；浅底、深绿文字、浅柠绿主按钮、顶部中央切换。网页控件和文字全部由代码实现。

Concept generated with built-in Image Gen: four coordinated screens, pale background, forest typography, lime actions and centered mode navigation. All interactive UI is code-native.

核对项目：页面顺序、中央图标切换、首屏未知角色、资料生成、Gravity 简要评价、完整详情门槛、发牌与翻转。已修复中文资料无法形成有效关系、旧角色样式覆盖尺寸和切换页面后的滚动位置。

Compared page flow, centered navigation, entry composition, typography and palette, avatar cards and flipping, and mobile overflow. Fixed legacy avatar sizing overrides and scroll reset on navigation.

有意差异：沿用冻结的现有矢量角色；首页呈现未知角色而非确定的自有形象；Gravity 详细资料延后到选择后；新增品牌资料结构和演示邀请边界。

Intentional differences: frozen existing vector characters, an unknown character on entry, full brand detail only after partner selection, structured brand intake, and explicit invitation boundaries.

浏览器检查：Chrome / CUA，桌面与手机 390×844。首页、示例资料生成、中文资料 Gravity、图标切换、发牌、翻转、两种模式的共用详情及下一步已检查。控制台未出现应用错误。真实文件上传自动化受浏览器扩展文件访问权限限制，解析逻辑由单元测试验证。

Browser verification used Chrome through CUA at desktop size and 390×844. Entry, sample intake generation, Chinese-profile matching, icon switching, dealing, card reveal, shared detail and the next-step boundary were checked without app console errors. Automated real-file upload remained blocked by extension file-access permissions; parser behavior is covered by unit tests.

代码检查：`tsc -b`、Vite 生产构建、`eslint src server`、`vitest run`（vitest.config.ts 限定当前源码）。排除 outputs 是因为其中包含以前导出的独立项目与不同测试框架，不是当前运行代码。

Checks target the active source; `outputs` contains previous standalone exports using other test frameworks.

## 渐进资料与提案生成 / Progressive profiles and proposal generation

`discoverRelations` 在原评分之外控制可展示的连接：先保留总分至少 50 或有直接能力互补的关系；六个资料类别（能力、需求、目标、受众、气质、边界）未完整时，按已填写类别数限制发现数量，每个类别最多开放两个候选，最少两个上限。只有能力的最低资料最多展示两条。此上限是 V0 产品策略，不是新的模型权重或成功概率；没有有依据的候选时可以为零。补填会重新计算，聚焦其他品牌使用该品牌资料。原分数及权重保留。

Discovery uses a separate V0 visibility policy, not new scoring weights: retain fit ≥ 50 or direct complementarity, then cap incomplete profiles at two candidates per supplied matching category. A capability-only profile shows at most two supported connections, possibly zero. Updating the profile or changing focus recomputes discovery using that brand’s information.

提案接入、固定源版本和配置方式见 `integrations/README.md`。单项建议需主动采用，失败不会覆盖手动输入。完整提案复用原运行时的研究、三方向选择、设计、文案、视觉计划和审查；视觉计划不等于图片已经生成。

See `integrations/README.md` for the pinned source and setup. Field suggestions require explicit adoption and failures preserve manual content. Full proposals reuse the original staged runtime. A visual plan is not a generated image.
