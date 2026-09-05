# Brand 项目

- `brand-collider-skills-design/`：联名碰撞工作台、六个创作 Skill，以及 Image 2 API 生图适配器。
- `brand-case-research/`：品牌合作案例的整理、检索与研究资料包工具。
- `品牌物料/`：原始资料与案例库。

## 联名碰撞工作台

上传两个品牌的资料，让两个 AI 品牌角色公开讨论并形成联名方向。你可以通过第三方输入框追加标准，选择方向后继续细化方案。页面支持真实模型模式和明确标注的演示模式。

Node.js 24+，在本目录执行：

```bash
npm --prefix brand-collider-skills-design ci
npm --prefix brand-collider-skills-design run dev
```

打开 [http://localhost:5173](http://localhost:5173)。生产构建与启动：

```bash
npm --prefix brand-collider-skills-design run build
npm --prefix brand-collider-skills-design start
```

构建后的网页与 API 由 [http://localhost:4318](http://localhost:4318) 提供。配置、运行流程与实现边界见 [工作台说明](brand-collider-skills-design/docs/WORKBENCH.md)。

## API 生图

Node.js 24+，在本目录执行：

```bash
npm --prefix brand-collider-skills-design run image:check
npm --prefix brand-collider-skills-design run image:generate -- --prompt "米白色陶瓷杯，暖灰背景，柔和棚拍光，无文字"
```

第一条检查连接与模型列表，第二条实际生成一张图片。当前通过 CPA 的 `gpt-6-astra` 调用 `gpt-image-2`，凭证由现有 remote-cpa helper 读取到内存，不使用先前的 HNCloud Key。

配置和后续服务端调用示例见 [Image 2 接入说明](brand-collider-skills-design/docs/IMAGE_API.md)，测试证据见 [检查记录](brand-collider-skills-design/CHECKS.md)。
