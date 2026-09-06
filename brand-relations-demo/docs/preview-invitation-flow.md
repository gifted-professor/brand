# 联名预演邀请 / Collaboration Preview Invitation

## 判断 / Product decision

原流程缺少双方意愿这一层。推荐、抽中、选择伙伴，都只是发现或我方兴趣，不构成双方 Match。把下一步定义为「联名预演邀请」：先向对方呈现一起可能做出的产物，再请求对方决定是否继续。

A recommendation, draw, or partner selection represents discovery or unilateral interest. A collaboration preview invitation presents a possible outcome and asks the recipient whether to proceed. Mutual intent is a separate state.

## 当前流程 / Current flow

Gravity 或抽卡 → 简要评价 → 选择伙伴 → 品牌详情 → 用联名预演建立联系 → 准备提案 → 模拟发送 → 接收方查看 → 同意建联 / 希望调整 / 暂不参与。

Gravity or draw → brief assessment → partner selection → brand details → preview invitation → proposal draft → simulated submission → recipient review → accept contact / request changes / decline.

发起方以提交提案表达意向。只有接收方明确同意当前版本，才解锁共创入口。同意的范围是继续沟通与共创，不替双方确定费用、交付或品牌商用许可。

Submitting expresses the sender's intent. The recipient must accept the current version before the co-creation entry unlocks. This signals willingness to proceed, not agreed commercial or licensing terms.

## 接收方先看到什么 / What the recipient sees

- 联名预演区：未来呈现产品、体验或内容 Demo；当前明确标注「预演占位 · 暂未生成 Demo」。
- 具体产物和消费者得到的价值。
- 发起方愿意提供的资源。
- 希望邀请接收方参与的事项，避免代替对方承诺。
- 三项诊断：需求与拒绝原因、双方收益与承担、交付与问题责任。
- 版本、水印、当前状态和三种回应按钮。

The recipient sees a preview, consumer value, sender contributions, requested participation, the three diagnostics, and clear response choices. The current preview is a labeled placeholder; no generated collaboration artwork is claimed.

## 状态规则 / State rules

| 状态 / State | 可以做什么 / Available actions | 可以进入共创 / Co-create |
|---|---|---|
| 草稿 draft | 编辑并提交 / Edit and submit | 否 / No |
| 等待回应 pending | 接收方回应；发起方撤回 / Recipient responds; sender withdraws | 否 / No |
| 希望调整 revision | 发起方修改为新版本 / Sender prepares a new version | 否 / No |
| 暂不参与 declined | 本次结束，可准备新提案 / End current invitation; optionally draft another | 否 / No |
| 已撤回 withdrawn | 当前邀请失效 / Current invitation invalid | 否 / No |
| 同意建联 accepted | 进入共创入口 / Open co-creation entry | 是 / Yes |

提交后冻结提案内容。对方反馈不会自动批准提案；修订进入新版本并需要重新提交、重新同意。拒绝或撤回后不接受旧邀请的迟到确认。

Submitted content is frozen. Feedback does not approve a proposal. Revisions require a new submission and acceptance. Declined or withdrawn invitations reject late acceptance.

## 水印的作用与边界 / Watermark meaning and limits

未同意：合作提案 · 未经双方确认，加上发起方、接收方与版本。

同意建联后：概念提案 · 未获商用授权。不会因为一次建联同意就输出「正式合作已发布」或无条件去除标记。

Before acceptance: proposal, not mutually confirmed, with sender, recipient and version. After contact acceptance: concept proposal, commercial authorization not granted.

当前 CSS 水印只传达状态，不能防止复制、截图或被移除。真实产品可以考虑将水印合成到预览文件，限制原文件下载，并用可撤回的受邀查看链接管理访问。这些能力尚未实现。

The current CSS watermark communicates status; it cannot prevent copying, screenshots or removal. A future production implementation can render marks into preview files, restrict original-file downloads and use revocable recipient access. These features are not implemented.

## 本轮完成与保留范围 / Implemented scope

- 已接通两种匹配模式共用的详情到邀请路径。
- 新增联名预演占位、可编辑提案、接收方演示视角、修改/拒绝/接受/撤回、版本与水印状态。
- 同一品牌对的提案保留在 App 会话内，退出详情后再进入可继续。刷新或关闭页面会丢失本次邀请状态。
- 共创仅解锁入口并说明下一阶段，未设计共创页面。
- 无实际发送、远端收件箱、真实账号权限或 Demo 生成服务。接收方切换按钮只用于本地演示，不能用于真实身份验证。
- 角色渲染器、评分因子与权重没有改变。入口、资料上传、图标切换和抽卡的同期调整由「UI」任务维护；本轮沿用其最新实现。

Both matching modes reach the same invitation flow. Proposal state survives navigation within the current App session, but not refresh. Delivery, identity, remote inboxes, generation and the co-creation interface remain future work. The demo's perspective switch is not authentication.

## 代码入口 / Code map

- `src/domain/invitation.ts`：纯状态转换，限制发送与回应角色，冻结已提交版本。
- `src/domain/invitation.test.ts`：覆盖单方不能自我匹配、内容完整性、提交后不可修改、新版本重新确认、拒绝与撤回。
- `src/components/CollaborationInvitation.tsx`：草稿、预演、接收方回应与共创入口。
- `src/components/invitation-flow.css`：预演区、水印、桌面双栏与手机单栏。
- `src/App.tsx`：按品牌对管理邀请状态；`PartnerDetailPage.tsx` 提供统一入口。

## 验证 / Verification

类型检查、生产构建、源码 Lint 和当前 49 个单元测试通过。使用内置浏览器走通虚构品牌选择、详情、草稿、提交、请求修改、第二版、接收方接受与共创入口。手机 390 px 宽下 DOM 内容宽度保持 390 px，无横向溢出；浏览器控制台无应用错误。拒绝与撤回的终止规则由状态测试覆盖。

Type checking, production build, source lint and 49 unit tests passed. The in-app browser verified selection through revision and recipient acceptance. Mobile DOM width remained 390 px without horizontal overflow. Decline and withdrawal finality are covered by state tests.

## 公开参考 / Public references

- [Radix Toggle Group](https://www.radix-ui.com/primitives/docs/components/toggle-group)：单选图标按钮的可访问标签与键盘交互。
- [Motion accessibility](https://motion.dev/docs/react-accessibility)：尊重减少动态效果设置。

These informed the companion mode-switch and motion work. No third-party asset or full application source was copied into the invitation flow.
