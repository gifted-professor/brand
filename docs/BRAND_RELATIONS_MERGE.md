# Brand Relations 接入记录

日期：2026-09-06。

## 来源与结构

- Brand Relations 来源：https://github.com/KAI-NEX/brand-relations-demo ，主分支 `2e00791ba1d63ef0e70b6c4f8d8f2d1d5056d8be`。
- 工作台分支：`collider-integration`，提交 `cb000d892b35607e62a6014d119fd5e6addd69a5`；与本地共同祖先为 `b47faa7`。
- 本地基线：`70a3819`，保留 Flova 视频、真实参考匹配、案例研究库与全部原项目资料。
- 对方主分支是独立应用历史，不直接在仓库根目录合并。源码及演示素材导入 `brand-relations-demo/`，保留其 MIT LICENSE。未导入重复源码 ZIP、旧 output 审计产物、原子模块指针和独立仓库 CI。
- 工作台分支通过 Git 合并保留原提交历史；品牌发现应用直接引用相邻工作台，不再保存第二份工作台副本。

## 集成调整

1. 共享工作台支持渠道预演参数、可拖动／键盘调整的对话宽度与 4:5 画幅。
2. 独立工作台保留历史项目与新建入口；渠道预演使用宿主返回导航。
3. 前端与服务端导入、运行时 Skill 目录指向本仓库工作台。
4. Vite 去重 React，允许读取相邻工作台，入口默认端口为 5174。
5. TypeScript 加入 DOM.AsyncIterable，兼容现有 Flova 视频流类型；sharp 与工作台统一为 0.35.4。
6. 更新画幅回归检查：4:5 进入冻结队列并传到生成接口，5:7 仍被拒绝。

## 运行与数据

在仓库根目录安装工作台依赖，再启动发现入口：

```sh
npm --prefix brand-collider-skills-design ci
cd brand-relations-demo
npx --yes pnpm@10.11.0 install --frozen-lockfile
npx --yes pnpm@10.11.0 dev
```

访问 http://127.0.0.1:5174/ 。案例入口为 `/?view=cases`。原工作台仍使用 5173 开发端口和 4318 API 端口。

发现入口读取自己的 `.env.local`，不会复制原工作台的凭证。运行数据保存在 `brand-relations-demo/outputs/`；原工作台会话保留在原位置。两入口共享代码，但会话存储分别维护。

真实文字／图片生成取决于本机配置。库迪 × 奶龙案例含已预加载素材；浏览器验证不会调用付费生成或发送建联消息。单独部署 dist 不包含服务端接口。

## 验证

- 两入口的 TypeScript 检查与生产构建均通过。
- 原工作台 490 项 Node 测试全部通过；Brand Relations 的 35 个测试文件／152 项 Vitest 测试全部通过，共 642 项。
- Brand Relations ESLint 检查通过。
- 浏览器：首页、案例列表、库迪 × 奶龙进入共享画布；7 项成果和两张预加载图正常显示。
- 原工作台新建／历史入口，以及共享画布宽度调整。
