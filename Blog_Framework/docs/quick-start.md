# 简单上手教程

不需要 AI，也不用修改页面代码。用记事本或 VS Code 就能写文章。

## 1. 打开博客

先安装 Node.js 22 或更新版本。Windows 用户双击框架目录里的 `start.bat`，然后打开 `http://127.0.0.1:4173/`。关闭命令窗口即可停止预览。

其他系统在框架目录运行：

```sh
npm run build
npm start
```

## 2. 换成自己的信息

用文本编辑器打开 `config/site.js`，修改：

- `name`：昵称或博客名字。
- `tagline`：首页副标题。
- `bio`：个人介绍。
- `socials`：自己的社交主页，不需要的填空字符串 `''`。
- `avatar`、`background`：头像和背景图片路径。

图片先放进 `public/assets/images/`，路径例如 `assets/images/my-avatar.png`。修改时保留引号和逗号，保存后运行 `npm run build` 再刷新页面。

## 3. 写一篇文章

在 `content/posts/` 新建 `my-first-note.md`，复制下面的内容，再改成自己的文字：

```text
Title: 我的第一篇文章
DateTime: 2026.11.10 / 20:00
Id: my-first-note
Summary: 这是我的第一篇文章，记录今天的学习和想法。
---
# 我的第一篇文章

这里开始写正文。

## 一个小标题

普通段落直接写。**这样是加粗**，`这样是代码`。

- 第一项
- 第二项
```

把日期改为文章发布日期；每篇文章的 `Id` 必须不同，建议使用英文和连字符。`---` 上面是文章信息，下面是 Markdown 正文。

需要分类和彩色标签时，在 `---` 前加上：

```text
Category: 学习
Tags: Java, 笔记
Color: #f97316
```

分类名可以自己取，不填就不分类；标签不填就不显示。

## 4. 让文章显示出来

保存文章，在框架目录的终端运行：

```sh
npm run build
```

刷新浏览器，点击首页的 DashBoard 查看文章。Windows 也可以关闭预览窗口后重新双击 `start.bat`，它会重新生成文章数据。

修改配置、图片或文章后，都运行 `npm run build`，再刷新页面。不要直接改 `.local/notes_data.js`，它会被构建覆盖。

## 5. 添加书架

将可以公开分享的 PDF 放到 `public/assets/books/`，编辑 `config/books.js`：

```js
window.booksData = [
    { title: '我的学习笔记', file: 'assets/books/my-notes.pdf' }
];
```

上例需要实际放入名为 `my-notes.pdf` 的文件。没有 PDF 就保持空书单。

## 6. 发布网站

运行：

```sh
npm run verify
```

成功后，将生成的 `dist/` 目录内容上传到静态网站托管平台。GitHub Pages 的配置方法见[部署说明](deployment.md)。只把源码上传 GitHub，并不代表网站已经部署。

之后每次更新文章，都重新构建并发布新的 `dist/`。想深入修改布局，再看[内容维护](content.md)和[架构说明](structure.md)。
