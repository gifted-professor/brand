# 品牌角色与资料导入更新 / Avatar & Intake Update

## 已完成 / Completed Work

- 首页保留布局；问号直接叠在更虚化的角色上，去掉底框和原右下角示例说明。
  Landing layout retained; a question mark floats directly over a blurred character, without a filled frame.
- Gravity 展示四级细节：完整产品穿搭 → 虚化角色 → 头像 → 点。视口以外节点休眠，评分不改变 LOD 阈值。
  Gravity uses four visible levels: detailed outfit → blurred figure → portrait → dot. Offscreen nodes sleep; scores do not control LOD.
- 多文件导入、限制说明、折叠文件管理与逐栏目编辑。第一次导入自动生成；之后文件增删变更才允许重新生成。文件未变，手动编辑不会启用重新生成。
  Multi-file intake includes limits, a collapsed file list and inline field editing. Initial import generates automatically; subsequent generation requires changed files.
- 编辑角色直接回到导入页，左上角返回，底部回到 Gravity。
  Edit avatar opens intake directly, with a back arrow and a bottom return to Gravity action.
- 抽卡同时翻转和放大，以非线性缓动及轻微回弹表现惯性；关闭反向收回，可连续查看不同卡牌。尊重系统减少动态效果设置。
  Cards flip and expand together with nonlinear easing and subtle overshoot, then reverse on dismissal. All cards remain available. Reduced motion is respected.
- 新增 `/?view=lab`：虚构品牌「未至日常」及用户提供的 8 张形象参考。展示可观察的服装、产品、配色和标识，同时保留无法从图片确认的信息。
  The visual lab combines fictional brand “未至日常” with eight user-provided portraits and visible product/identity observations.

## 隔离与边界 / Isolation & Limits

实验品牌仅保存在当前 React 页面内存中。资料在浏览器读取（实验导入支持 TXT / MD / JSON），不会进入正常品牌存储、后端资料接口或提案引擎。退出实验或刷新会清空实验修改。图片是用户提供的静态参考；识别文字是人工观察的 demo 内容，并非在线模型识别结果，也不证明真实品牌合作。

Lab data stays in React memory. Lab imports read TXT / MD / JSON in the browser and do not use normal brand storage, upload endpoints or proposal services. Leaving or refreshing resets edits. Images are supplied static references; descriptions are curated demo observations, not live model output or evidence of actual collaborations.

普通流程保留现有服务端接口；当前运行环境未配置模型，展示基础识别与产品方向穿搭示意。真实模型生成仍需配置后单独验证。

The normal flow retains server integrations. Models are not configured in the current environment; it shows basic extraction and illustrative outfits. Live generation needs separate verification after configuration.

## 验证 / Validation

- TypeScript 类型检查、完整 ESLint 检查、Vite 构建通过；98 个测试通过。
  TypeScript, full ESLint and Vite build passed; 98 tests passed.
- 浏览器检查首页、文件管理、逐字段编辑、重新生成状态、四级 LOD、连续翻卡、实验邀请及回到导入页。
  Browser checks cover landing, file management, inline edits, regeneration gating, four LOD stages, sequential card reveals and isolated lab navigation.

## 后续计划 / Remaining Work & Plan

配置真实模型后，验证多类型资料解析、穿搭一致性和模型失败后的产品体验；继续用实际浏览器帧率与更多品牌规模校准动画及 LOD 阈值。

After model setup, validate extraction across supported files, outfit consistency and failure recovery. Calibrate motion and LOD thresholds using frame-rate measurements and larger brand sets.

## 技术难点 / Technical Challenges

文件修改与手动修正需要分别处理：文件指纹控制重新生成，字段编辑只更新品牌资料。实验流程必须从导入一直隔离到合作邀请。翻牌收起读取当前变换，以减少动画中途关闭的跳变。

File mutations and manual corrections are separate: document fingerprints gate regeneration while field edits update the profile. Lab isolation extends through invitation preview. Closing a card starts from its current transform to reduce interruption jumps.

## 动画参考 / Motion References

使用 CSS 动画实现，参考 Apple 对连续、自然运动的原则；并非使用 Apple 原生动画框架。
Implemented in CSS, inspired by Apple's natural and continuous motion guidance, not an Apple animation framework.

- [Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [WWDC23 — Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/)
