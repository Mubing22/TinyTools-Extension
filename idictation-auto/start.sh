#!/usr/bin/env bash
# 一键启动器（macOS / Linux）
set -u
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  [!] 没有检测到 Node.js。"
  echo "      请先从 https://nodejs.org/ 安装 LTS 版本，再运行本脚本。"
  echo
  exit 1
fi

exec node start.mjs
