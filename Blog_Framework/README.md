# Blog Layout

原生 HTML、CSS、JavaScript 编写的三页静态博客布局。无需前端框架和运行时依赖，适合直接修改、学习或部署到静态托管服务。

这是布局框架，独立于个人博客。这里只包含示例文章、自制 SVG 背景和头像，不包含个人博客的文章、PDF、插画、自定义域名或登录信息。

第一次使用可直接看[简单上手教程](docs/quick-start.md)，按步骤启动、写文章和发布。

## 本地预览

需要 Node.js 22 或更新版本。进入此目录后运行：

```sh
npm run build
npm start
```

浏览器打开 `http://127.0.0.1:4173/`。无需执行 `npm install`。Windows 也可双击 `start.bat`；关闭终端停止服务。

## 页面与效果

- `index.html`：全屏背景、鼠标轻微偏移、周边模糊与流光标题。
- `Project.html`：文章列表、可选分类筛选、彩色标签、社交图标与 PDF 书架。默认不预设分类或标签。
- `article.html?id=welcome`：Markdown 正文、字数、预计阅读时间与自动目录。
- 三页共享日夜状态与按钮样式。日夜和首页／列表切换使用圆形扩散，进入文章详情普通跳转。
- 列表页提供低密度雨背景。系统开启“减少动态效果”时跳过动态特效。
- 列表配图功能保留，但默认隐藏，参见 `article-list.css` 的 `.article-row-cover`。

## 换成自己的内容

先编辑 [site.js](config/site.js)，修改昵称、介绍、头像、背景和社交主页。社交地址留空会隐藏对应图标；配置文件是公开文件。

文章放在 `content/posts/`，修改后运行 `npm run build`。书单写在 [books.js](config/books.js)，PDF 放在 `public/assets/books/`。所有图片和 PDF 都需要自行提供。

具体步骤见 [内容维护](docs/content.md)。

## 检查与部署

```sh
npm run build
npm run check
```

构建会生成独立的 `dist/`，只包含三页 HTML、公开 assets 和 .nojekyll。部署这个目录即可，不需要运行 Node 后端；它不会包含 notes、脚本、测试或本地配置目录。每次发布前运行 `npm run verify`。

在 GitHub Pages 使用 Actions 发布时，把 `dist/` 作为 Pages artifact 上传；不要将整个 TinyTools 当作博客发布源。框架也可以单独复制成仓库。详见 [部署与 CI](docs/deployment.md)。

不要只上传 HTML：`dist/assets/` 也需要上传。模板不带 `CNAME`，使用自己的域名时另行配置。Google Fonts 加载失败时会回退到系统字体；如需完全离线请自托管字体。

跨页动画依赖浏览器的跨文档 View Transitions 支持；不支持时正常跳转。用 HTTP 预览，避免 `file://` 下的限制。

## 结构

见 [架构说明](docs/structure.md)。所有功能均使用原生浏览器 API；Markdown 渲染使用本地 vendored Marked，并保留其 MIT 许可。

## 许可

项目代码及模板自制 SVG 使用 [MIT](LICENSE)。第三方部分见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。自行添加的文章、图片、字体和 PDF 不会因放入模板而自动获得 MIT 授权。
