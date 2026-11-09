# 构建、CI 与部署

## 命令

| 命令 | 用途 |
| --- | --- |
| npm start | 构建后仅本机预览 dist，默认 4173 端口 |
| npm run build:content | 校验元数据并更新文章数据 |
| npm run check | JavaScript 语法与页面静态资源检查 |
| npm test | Node 内置测试，无依赖 |
| npm run build | 内容构建、校验、生成 dist/ |
| npm run verify | 完整测试与构建 |

dist/ 为可丢弃生成目录，不提交 Git；构建只清理这个固定目录，不触碰 notes 或其他源码。

## GitHub 仓库中的位置

当前框架位于 TinyTools/Blog_Framework。GitHub 仅识别仓库根目录的 .github/workflows；本目录内的工作流是独立仓库模板，复制框架单独建仓时可直接使用。

TinyTools 根目录另有仅检查本框架的 CI 工作流。工作流只测试和构建，不自动提交、发布或部署。支持 Node.js 22/24，Windows/Linux。

## 发布静态网站

运行 npm run verify 后，将 dist/ 上传静态托管。GitHub Pages 推荐单独部署工作流：

1. checkout 仓库，准备 Node.js。
2. 在 Blog_Framework 内运行 npm run verify。
3. 使用 GitHub 官方 upload-pages-artifact 上传 Blog_Framework/dist。
4. 使用 deploy-pages 发布，仓库 Pages 来源设置为 GitHub Actions。

发布需要 pages:write、id-token:write 以及对应 environment 配置。这里不预设部署目标，不会自动把 TinyTools 主站替换成博客。

## 发布前人工检查

检查昵称和社交地址，换掉示例文章；确认图片、PDF、字体具有分发授权。不要把凭据放进 site-config.js。三页导航、主题、文章链接、书架下载与手机布局都应本地预览一次。
