# 目录与数据流

```text
config/             公开站点信息和书单配置
content/posts/      Markdown / txt 文章源文件
src/
  layouts/          HTML 基础布局
  components/       公共 head、导航、日夜按钮、名片和页脚
  pages/            页面内容片段和页面 manifest
  scripts/          浏览器交互
  styles/
    tokens.css      全局设计变量
    base.css        基础规则
    components/     导航等共享组件样式
    pages/          各页样式
public/assets/      图片、PDF、Marked 及许可文件，原样复制
scripts/
  lib/              内容解析和模板渲染
test/               Node 内置测试
docs/               使用和维护说明
dist/               生成的网站，不提交
.local/             构建中间数据，不提交
```

构建流程：解析 content/posts → 校验元数据与 ID → 组合 layout、components、pages → 复制静态资源和客户端脚本 → 生成 dist → 资源检查。

## 页面和链接

页面源码为 src/pages/home.html、articles.html、article.html，对应 manifest 为同名 JSON，声明输出名、导航和页面资源。公开 URL 保留 index.html、Project.html、article.html，兼容已有浏览器交互与链接。

改导航只编辑 src/components/navigation.html；日夜按钮在 theme-toggle.html。新增页面组件用 {{> component-name}} 引用。模板只处理本地可信源码，不接受用户输入作为模板。

## 配置与内容

config/site.js 控制站点信息、图片、社交地址和效果开关；config/books.js 控制 PDF 书单。它们在 dist 中输出为 assets/data/site-config.js、books.js。

文章由 scripts/lib/content.js 统一解析；分类从 Category 自动生成，标签只读显式 Tags。无分类和标签时不显示。生成数据不手动编辑。

public 是磁盘目录，网站路径不包含 public。例如 public/assets/images/photo.png 的配置值是 assets/images/photo.png。

## 样式与交互

styles/tokens.css 放设计变量，base.css 放基础规则；组件和页面样式独立组织。现有页面主题变量仍局限在相应页面样式，后续修改以共享导航和 tokens 为入口。

theme.js 管主题状态；page-transitions.js 管圆形扩散；article-list.js 管列表筛选；article.js 管正文和目录；projects.js 管书架；landing.js 和 ambient-rain.js 管背景效果。

## 发布边界

仅 dist 部署；服务仅提供 dist，不提供 config、源码、测试和文章源文件。公开文章数据仍包含正文，这是静态博客的正常行为。Markdown 支持 HTML，只发布可信内容。
