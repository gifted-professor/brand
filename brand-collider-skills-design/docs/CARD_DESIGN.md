# 方案卡片的视觉参考

本次网页以可阅读、可选择、可展开的联名方案卡片为交付形式。视觉参考为 Yan Liu 的 [mono-color-skill](https://github.com/yanliudesign/mono-color-skill)，读取日期为 **2026-09-05**，核对版本为 [`c8ff70597ddedcd65f21a0b528f6a70c35690b0a`](https://github.com/yanliudesign/mono-color-skill/tree/c8ff70597ddedcd65f21a0b528f6a70c35690b0a)（提交日期 2026-09-02）。

这里借鉴颜色分工、文字层级、构图和阅读节奏，自行实现网页组件。未安装该仓库的生图 Skill，也没有将其完整海报生成流程接入工作台。原 Skill 默认产出生成提示词、栅格图与配方；用户本次明确要求网页卡片，因此卡片结构按产品需求设计，原参考对海报中卡片网格的默认限制不作为本页面的验收条件。

## 应用于页面的五条规则

1. **先分配颜色的工作，再选择颜色。** 卡面使用纸白 `#FAFAF7`、冷灰 `#E9E9E5` 或浅米 `#F5F1E8`；一个主色承载方案名称和关键内容，另一个颜色只强调编号、选中状态或少量标记。例如钴蓝 `#2148B8` 与陶土橙 `#C65F38`。参考中的 70%–85% 主色、15%–30% 强调色描述的是印刷着墨面积，网页把它转化为强调程度，不作为 CSS 像素占比要求。[颜色目录](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/design-system/colors.json)

2. **每张卡只设置一个最醒目的文字层级。** 方案名称或核心主张为焦点，编号、Skill 名称和版本使用安静的工具文字；正文保持适合中文阅读的字号和行高。文学、生活方式主题可选衬线展示字，研究与执行信息可选清楚的无衬线字。同一卡片不叠加多个花式字体，核心信息不旋转、不裁切。原参考的海报字号比只作为层级启发，不直接照搬到网页。[文字目录](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/design-system/typography.json)

3. **把卡片排成有主次的提案，而不是等权文字盒。** 主方案卡承担主题与消费者价值；双方贡献、设计、文案、视觉计划和审查各有明确入口。卡内采用清楚的左对齐边缘、少量分隔线和疏密不同的信息块；宽屏可用跨列主卡，窄屏自然转为单列。页面的阅读顺序必须与内容的重要程度一致。[构图目录](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/design-system/compositions.json)

4. **强焦点旁边保留安静区域。** 一张卡可以有醒目标题或一个视觉元素，其余内容为它让出空间。通过边距、段落间距、短摘要和展开详情控制信息密度；留白不填充无意义的装饰文案。卡片高度跟随真实内容，避免为追求统一比例截断模型结果。参考的留白比例适用于印刷画布，网页重点验证缩小后是否仍有明确焦点、展开后是否容易阅读。[节奏目录](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/design-system/rhythm.json)

5. **印刷感保持克制，信息状态保持准确。** 可用细线、平面色块和轻微网点获得编辑印刷感，避免让纹理覆盖正文。品牌标识、示例图片、构图与文案均不从参考作品复制。卡片摘要应来自当前版本的模型结果，缺失字段不补写为模型结论；视觉提示、待确认事项和已经生成的图片保持各自可识别的状态。[Skill 说明](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/SKILL.md)

## 来源与许可

- [README](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/README.md)用于确认参考项目的用途、交付形式及视觉原则；上面的四个设计目录用于核对具体语法。规则中的网页交互、响应式布局与数据状态要求是本项目的适配决定。
- [MIT License](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/LICENSE)覆盖源代码、Skill 指令、脚本及软件组件，版权标注为 `Copyright (c) 2026 Yan Liu`。若后续复制代码或软件的实质部分，应随副本保留原版权与许可声明。
- [Visual Asset License](https://github.com/yanliudesign/mono-color-skill/blob/c8ff70597ddedcd65f21a0b528f6a70c35690b0a/ASSET-LICENSE.md)另行约束图片：`examples/` 中 Yan Liu 的原创示例不属于 MIT 授权；第三方研究参考仍属于各自权利人。本次没有复制、下载或嵌入这些示例与参考图片。

两位品牌 Agent 调用的仍是工作台原有六个方法 Skill。此文档描述方案的展示语言，不增加一个已经执行过的第七个生图 Skill，也不代表完成图像审查。
