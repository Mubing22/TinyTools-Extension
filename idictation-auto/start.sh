#!/usr/bin/env bash
# 一键启动器（macOS / Linux）
#
# 覆盖的情况：
#   1. 已有达标 Node        → 直接跑
#   2. 有 Node 但版本太旧    → 提示升级
#   3. 没有 Node，有包管理器 → 问你要不要自动装（装系统包需要密码）
#   4. 什么都没有           → 给出手动安装步骤
set -u
cd "$(dirname "$0")"

MIN_MAJOR=22

node_major() {
  local v
  v="$(node -v 2>/dev/null)" || return 1
  echo "${v#v}" | cut -d. -f1
}

if command -v node >/dev/null 2>&1; then
  major="$(node_major)"
  if [ -n "$major" ] && [ "$major" -ge "$MIN_MAJOR" ] 2>/dev/null; then
    exec node start.mjs
  fi
  echo
  echo "  当前 Node 版本是 $(node -v)，本工具需要 v${MIN_MAJOR} 或更高"
  echo
  ACTION=upgrade
else
  echo
  echo "  没有检测到 Node.js"
  echo
  ACTION=install
fi

# 找出这台机器能用的包管理器
if command -v brew >/dev/null 2>&1; then
  INSTALL_CMD="brew install node"
elif command -v apt >/dev/null 2>&1; then
  INSTALL_CMD="sudo apt install -y nodejs npm"
elif command -v dnf >/dev/null 2>&1; then
  INSTALL_CMD="sudo dnf install -y nodejs npm"
elif command -v yum >/dev/null 2>&1; then
  INSTALL_CMD="sudo yum install -y nodejs npm"
elif command -v pacman >/dev/null 2>&1; then
  INSTALL_CMD="sudo pacman -S --noconfirm nodejs npm"
elif command -v zypper >/dev/null 2>&1; then
  INSTALL_CMD="sudo zypper install -y nodejs npm"
elif command -v apk >/dev/null 2>&1; then
  INSTALL_CMD="sudo apk add nodejs npm"
else
  INSTALL_CMD=""
fi

if [ -n "$INSTALL_CMD" ]; then
  echo "  可以用下面这条命令安装 Node："
  echo
  echo "      $INSTALL_CMD"
  echo
  printf "  现在执行吗？需要时请按提示输入密码 [y/N] "
  read -r answer
  case "$answer" in
    y|Y|yes|YES)
      echo
      eval "$INSTALL_CMD"
      if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$MIN_MAJOR" ] 2>/dev/null; then
        exec node start.mjs
      fi
      echo
      echo "  安装完成但版本仍不满足要求，请用 https://nodejs.org/ 的 LTS 版本"
      echo
      exit 1
      ;;
    *)
      echo
      echo "  已取消。装好 Node 后重新运行本脚本即可"
      echo
      exit 1
      ;;
  esac
fi

echo "  请从 https://nodejs.org/ 下载安装 LTS 版本，然后再运行本脚本"
echo
echo "  注意：apt/dnf 仓库里的 nodejs 版本可能偏旧，如果装完仍低于 v${MIN_MAJOR}，"
echo "        建议用 NodeSource 或官方安装包：https://nodejs.org/en/download"
echo
exit 1

