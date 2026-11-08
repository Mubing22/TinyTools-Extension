# TinyTools

一些自己写的小工具，每个工具解决一个具体的小问题，各自独立，互不依赖

## 工具列表

| 工具 | 说明 | 平台 |
| --- | --- | --- |
| [idictation-auto](./idictation-auto) | 爱听写（idictation.cn）词汇选择题自动作答，走浏览器 CDP 发真实点击 | Windows / macOS / Linux |

## 怎么用

每个工具都是自包含的，用法写在它自己的 `README.md` 里，以 `idictation-auto` 为例：

```bash
git clone https://github.com/dayDReam-10/TinyTools.git
cd TinyTools/idictation-auto
```

然后按该目录下 README 的步骤操作即可，不熟悉命令行的直接看里面那份说明，Windows 上是双击 `start.bat`

> **跑命令之前先切目录**，所有命令都要在具体工具那个文件夹里执行，比如 `idictation-auto`，否则会报 `Cannot find module`——那不是工具坏了，是人在别的目录里敲的，不会 `cd` 的话：打开文件资源管理器进到该文件夹，在上方地址栏输入 `cmd` 回车，弹出的窗口就已经在正确目录了

## 目录约定

- 一个工具一个文件夹，名字用小写连字符
- 每个文件夹里必须有 `README.md`，写清楚要装什么、怎么跑、出问题怎么办
- 工具之间不共享代码，宁可各写一份也不互相依赖，这样单个文件夹可以直接拷走用
- 会生成个人配置或日志的工具，`config.json`、`*.log` 一律不提交

## 关于自动化类工具

仓库里这类工具会操作第三方网站，只用于自己的账号、自己有权处理的数据，遵守目标站点的服务条款，别高频请求，代码按现状提供，因使用产生的任何后果由使用者自行承担

## License

[MIT](./LICENSE)
