# 内容维护

## 新增文章

在 `content/posts/` 新建 UTF-8 的 `.md` 或 `.txt`：

```text
Title: 我的第一篇随笔
DateTime: 2026.01.03 / 20:00
Id: first-note
Status: 随笔
Color: #a78bfa
Summary: 今天记录一件值得记住的小事。
---
# 我的第一篇随笔

这里写 Markdown 正文。
```

运行 `npm run build`，预览 `Project.html`。不要直接修改生成的 `notes_data.js`。

| 字段 | 说明 |
| --- | --- |
| Title / DateTime | 必填标题与日期时间，格式见示例 |
| Id | 建议始终填写唯一、稳定的英文 ID |
| Category | 可选，自定义分类名；分类栏从文章数据自动生成，无分类时隐藏 |
| Status | 文章标签、详情状态文字 |
| Color | 六位十六进制颜色，控制标签文字颜色 |
| Tags | 可选，英文逗号分隔；只展示明确填写的标签，不从标题推测 |
| Summary | 人工简介；留空时列表尝试提取正文首段 |

正文图片放在 `public/assets/images/`，例如 `![说明](assets/images/flow.svg)`。路径从站点根目录计算，不要写本机盘符。

## 书架

把允许公开分发的 PDF 放进 `public/assets/books/`，然后编辑：

```js
window.booksData = [
    { title: '我的学习资料', author: '作者', file: 'assets/books/notes.pdf' }
];
```

`author` 可省略。页面只接受同站点、该目录下的 PDF；空书单显示整理提示。提交前确认文件存在、体积符合托管限制。

## 外观和社交

在 `config/site.js` 配置 `name`、`tagline`、`bio`、`footer`、`avatar`、`background`。默认头像和背景由模板自制，可自由修改。社交键为 github、kanxue、bilibili、x、netease；留空会隐藏。

`effects.rain` 控制列表页雨背景，`effects.parallax` 控制首页背景偏移。日夜模式由浏览器记住，不必手动填写主题。

## 常见问题

- 没有新文章：先运行构建，再刷新浏览器。
- 重复 ID 或日期报错：修正源文件元数据，构建校验通过才会更新数据。
- 页面没有水纹：确认使用 HTTP，并检查浏览器是否支持、是否开启减少动态效果。
- 端口被占用：退出已有预览服务，或设置 PORT 环境变量后启动。
