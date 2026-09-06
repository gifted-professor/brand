# 抽卡与 Gravity 动效参考

核查日期：2026-09-05。入口：页面右上角 Discover，可切换 Tarot、Card pack、Comet。

## 动画观看入口

- 塔罗交互：[Mystic Draw 在线演示](https://mystic-draw.datturbomoon.space/)，查看洗牌与翻面流程。
- 炉石开包：[所有卡包开包动画](https://www.bilibili.com/video/BV1LE411f7zF/)，历史版本合集，适合比较不同主题的蓄势和揭晓。
- 原神祈愿：[单抽动画片段](https://www.bilibili.com/video/BV1gq4y117ko) 与 [Wish Simulator](https://wishsimulator.app/)，查看流星到结果展示的节奏。
- Gravity 镜头：[Click to focus](https://vasturiano.github.io/react-force-graph/example/click-to-focus/)，查看点击节点后的镜头靠近。

视频入口已核对搜索页标题与描述，本轮未逐帧观看；原版素材未下载或加入项目。

## 参考项目

| 项目 | 可参考的内容 | 与当前项目的关系 |
| --- | --- | --- |
| [Mystic Draw](https://github.com/datturbomoon/Mystic-Draw) · [在线效果](https://mystic-draw.datturbomoon.space/) | 塔罗卡片的透视、背面隐藏、翻面与洗牌；原生 HTML/CSS/JS，MIT | 优先参考。当前版使用自己的卡背图形和品牌角色，实现扇形展开、提牌、翻面；未复制仓库代码或素材 |
| [Hearthstone Card Pack Opener](https://github.com/drewbeh/hearthstone-card-pack-opener) | 炉石开包模拟器的项目线索，仓库包含 MIT 许可 | 旧 AngularJS/Bower 项目，README 大量保留脚手架内容，不视为可直接接入的成熟动效组件 |
| [HS PackSim](https://github.com/jhuang0215/HS_PackSim) | React 炉石开包模拟器 | 老 React/Webpack 项目；此次 GitHub API 未返回开源许可，适合研究结构，不直接拷贝；旧在线演示未验证可用 |
| [Genshin Impact Wish Simulator](https://github.com/Mantan21/Genshin-Impact-Wish-Simulator) · [在线效果](https://wishsimulator.app/) | 抽取、播放过渡、跳过、结果展示的阶段划分；SvelteKit，MIT | 原 AguzzTN54 地址已跳转到 Mantan21。借鉴流星引导与揭晓节奏；游戏角色、视频、音效等素材的权利不能由代码许可推定 |
| [react-spring](https://github.com/pmndrs/react-spring) | 可中断的弹簧运动，适合提牌、拖拽回弹与卡片归位 | 后续需要真实弹簧/拖拽时优先评估；本轮未增加依赖 |
| [Motion](https://github.com/motiondivision/motion) | React 进出场、布局过渡、手势编排 | 当抽卡发展为跨页面共享卡片与复杂编排时评估；本轮未增加依赖 |
| [react-force-graph](https://github.com/vasturiano/react-force-graph) · [聚焦示例](https://vasturiano.github.io/react-force-graph/example/click-to-focus/) · [示例源码](https://github.com/vasturiano/react-force-graph/blob/master/example/click-to-focus/index.html) | 镜头平滑靠近节点、选中关系高亮、动态节点过渡；MIT | 参考镜头与高亮方式。当前 Gravity 继续使用既有评分到距离的布局；没有替换为物理模拟 |
| [d3-force](https://github.com/d3/d3-force) | 力导向布局与速度积分 | 适合未来离线松弛、碰撞求解的研究。不能直接让持续物理模拟改变目前由 Fit 定义的半径 |

## 当前实现与参考的取舍

### Tarot：默认发现方式

扇形展开约 750ms，每张错开 65ms；悬停提牌；点击后选中牌移到中央，其他牌退场；约 450ms 后开始 780ms 翻面，1350ms 时显示结果操作。自然浏览时使用轻量 CSS transform，不驱动 React 每帧更新。

### Card pack：有形的开包感

650ms 的蓄势与开包，随后展开五张卡片，用户选择一张揭晓。它是炉石开包节奏的克制改编，没有复刻游戏爆炸、声音或五张逐一收集的玩法。

### Comet：短镜头引导

流星轨迹引导视线到中央，随后卡片出现并翻面，完整揭晓约 1850ms。它是原神抽卡镜头节奏的简化表达，没有使用原神视频和角色素材。

三种方式都提供关闭和跳过；关闭时清理定时器。系统开启减少动态效果时，直接揭晓。

### Gravity：动效解释关系

选中关系线用 850ms 显现；聚焦或回中时产生一次 1100ms 波纹；镜头用 700ms 平滑回中，并在拖动、滚轮或缩放时立即中断。节点继续使用既有位置过渡。没有持续旋转、抖动或随机漂移。

## 数据约定

Discover 读取当前已计算好的 Relation；按合作分数排序，每轮展示五个候选，继续发现时轮换到下一组。它不是概率抽奖，不引入稀有度、保底或付费逻辑。翻出的品牌仍使用原来的 Fit 和解释。Explore this connection 只选中品牌并回中，Set as Focus 才会改变关系场焦点。

## 后续深化建议

1. 优先深化 Tarot：将现有占位角色替换为正式品牌卡面，并调整声音与提牌手感。
2. 若需要拖拽卡片到 Gravity 中，用 Motion 或 react-spring 做跨容器位置过渡，并保持动画可取消。
3. 若节点量明显增长，先对现有 LOD 和视口路径做性能测量，再考虑 Canvas/WebGL；单纯增加动画不需要替换布局引擎。

本页是参考与实现说明。链接可供进一步查看，不代表所有外部在线演示都已经完成交互测试。
