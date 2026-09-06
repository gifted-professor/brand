# 品牌产品穿搭 / Brand product wardrobe

基础角色使用用户 2026-09-06 提供的新参考：短身比例、玫瑰棕短发、不带帽子和眼镜。原图、V1 文件与生成过程文件均保留。

The base follows the user's new reference: short chibi proportions, rose-brown bob hair, no hat or glasses. Original assets, V1 files and intermediate generations are preserved.

## 已完成 / Completed

- Logo 居中，移除版本标签；原角色规则入口改为资料上传，不再选择能力家族或证据档位。
- 多文件上传完成后自动解析；产品图用于穿搭参考，文字文件用于品牌理解。最多 10 份文件，其中最多 3 张产品图；文字 8 MB/份，图片 6 MB/张。
- 固定基础人物，通过产品穿搭体现品牌差异。新增围巾、外套、包袋三种通用示意；只有明确产品描述才使用这些示意，需求或合作方产品不算自身产品。
- 已接入原 COLLIDER 图像提供器：参考底模、最多三张产品图片和有来源的品牌字段生成穿搭。文件读入与穿搭生成失败时保留材料，不自动重试付费请求。
- 角色图用于上传预览、首页、Gravity 各层级和卡牌；原匹配权重未调整。

The logo is centered and the version label removed. The old rule picker now opens material upload. A batch automatically proceeds to analysis. Text documents establish brand facts; product images guide appearance. The same base character is dressed in brand products. Three generic wardrobe examples remain clearly labelled. The existing COLLIDER image provider receives the base, up to three product references and sourced brand fields. Failed generation retains the materials and does not automatically retry paid requests. Matching weights are unchanged.

## 当前边界 / Current limits

当前环境未配置网站的模型服务。内置图像生成工具已用于制作项目素材，但不等于网站运行时已连接大模型。当前可测试真实文件读取、明确字段识别、通用穿搭示意及后续匹配；服务端模型配置后启用语义理解和逐品牌专属穿搭。生成图是概念效果，不是商品认证或完整 3D 骨骼模型。图片内容本身不作为消费者证据或交付能力证明。

No runtime model service is configured in this environment. The built-in image generation tool created the project assets; it does not connect the website to a model. File reading, explicit-field extraction, generic wardrobe previews and matching can be tested now. Server-side model configuration enables semantic analysis and per-brand image generation. Images are concepts, not authenticated products or rigged 3D models. Image appearance alone does not establish consumer evidence or delivery capability.

## 素材 / Assets

`public/avatars/base-reference-v2.png`：新基础角色。`public/avatars/wearables-v2/`：穿搭示意。`prompts.json`：内置 image_gen 使用的提示词。最终背景效果以实际文件为准，生成器未正确提供透明图层的中间结果保留作记录，不作为最终透明素材声明。

The base and wardrobe assets live in `public/avatars/`. `prompts.json` records built-in image_gen prompts. Intermediate outputs that failed to provide real alpha are retained; they are not described as transparent production assets.

最终三款穿搭示意使用 `*-final.png`，为纯白背景；基础图拥有真实 alpha。示意图目前不是透明 3D 换装层。

The final wardrobe examples use `*-final.png` on white backgrounds; the base has real alpha. These examples are not transparent or rigged 3D clothing layers.

## 验证 / Verification

96 项自动测试、TypeScript、src/server ESLint 和生产构建通过。浏览器实测 TXT + Markdown + PNG 上传后自动解析；围巾示意自动显示，无需能力/等级选择。检查了 1280px 桌面与 390px 手机页面，Logo 居中、没有横向溢出。开发时 main.tsx 热更新曾出现 createRoot 重复初始化提示；重新加载后未出现新的同类错误。真实模型图像生成因当前未配置服务而未进行端到端调用。

96 tests, TypeScript, scoped ESLint and production build pass. Browser checks cover automatic TXT/Markdown/PNG ingestion, wardrobe preview and centered layout at 1280px and 390px. A development-only duplicate createRoot warning occurred during entry-file hot update; none recurred after reload. Live model image generation was not exercised because the runtime service is unconfigured.
