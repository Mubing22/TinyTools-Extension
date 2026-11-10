# ensure-node.ps1 —— 保证本机有一个能用的 Node.js（>= 22），然后启动 start.mjs
#
# 覆盖的情况：
#   1. 已有达标 Node            → 直接用
#   2. 有 Node 但版本太旧        → 升级
#   3. 没有 Node，有 winget      → winget 静默安装
#   4. 没有 Node，有 choco/scoop → 对应包管理器安装
#   5. 什么包管理器都没有        → 下载官方 zip 解压，免管理员权限
#   6. 全部失败                 → 打开下载页并说明
#
# 调试用：powershell -File ensure-node.ps1 -DryRun   只打印判断结果，不安装

param([switch]$DryRun)

$ErrorActionPreference = 'SilentlyContinue'
$MinMajor = 22
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$SolveScript = Join-Path $Here 'start.mjs'

function Say($msg) { Write-Host "    $msg" }
function Good($msg) { Write-Host "    √ $msg" -ForegroundColor Green }
function Warn2($msg) { Write-Host "    ! $msg" -ForegroundColor Yellow }

function Get-NodeMajor([string]$exe) {
    if (-not $exe -or -not (Test-Path $exe)) { return 0 }
    $v = & $exe -v 2>$null
    if ($v -match 'v(\d+)') { return [int]$matches[1] }
    return 0
}

# 找所有可能的 node.exe：PATH、各家默认安装目录、nvm、volta、fnm
function Find-NodeExes {
    $list = @()
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { $list += $cmd.Source }

    $list += @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'nodejs-portable\node.exe')
    )

    if ($env:NVM_HOME) { $list += (Join-Path $env:NVM_HOME 'node.exe') }
    if ($env:NVM_SYMLINK) { $list += (Join-Path $env:NVM_SYMLINK 'node.exe') }
    if ($env:VOLTA_HOME) { $list += (Join-Path $env:VOLTA_HOME 'bin\node.exe') }
    if ($env:FNM_MULTISHELL_PATH) { $list += (Join-Path $env:FNM_MULTISHELL_PATH 'node.exe') }

    $list | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
}

# 下载官方 zip 解压到用户目录——不需要管理员权限，是最可靠的兜底
function Install-ByZip {
    Say '改为下载官方免安装版（不需要管理员权限）…'
    if ($DryRun) { Say '[DryRun] 将下载 nodejs.org 的 zip 并解压到 %LOCALAPPDATA%\nodejs-portable'; return $null }

    try {
        $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
            'ARM64' { 'win-arm64' }
            'AMD64' { 'win-x64' }
            default { 'win-x64' }
        }
        $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -TimeoutSec 30
        $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
        if (-not $lts) { throw '拿不到 LTS 版本列表' }

        $ver = $lts.version
        $name = "node-$ver-$arch"
        $url = "https://nodejs.org/dist/$ver/$name.zip"
        $tmp = Join-Path $env:TEMP "$name.zip"
        $out = Join-Path $env:LOCALAPPDATA 'nodejs-portable'

        Say "下载 $url"
        try {
            Invoke-WebRequest $url -OutFile $tmp -TimeoutSec 300 -UseBasicParsing
        } catch {
            # 部分老系统默认 TLS 版本偏低，显式打开 TLS1.2 再试一次
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest $url -OutFile $tmp -TimeoutSec 300 -UseBasicParsing
        }

        if (Test-Path $out) { Remove-Item $out -Recurse -Force }
        Expand-Archive -Path $tmp -DestinationPath $env:LOCALAPPDATA -Force
        $extracted = Join-Path $env:LOCALAPPDATA $name
        if (Test-Path $extracted) { Move-Item $extracted $out -Force }
        Remove-Item $tmp -Force
        return (Join-Path $out 'node.exe')
    } catch {
        Warn2 "下载安装失败：$($_.Exception.Message)"
        return $null
    }
}

function Try-PackageManagers([bool]$upgrade) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Say '检测到 winget，开始处理（可能弹权限窗口，请点“是”）…'
        if ($DryRun) {
            Say ('[DryRun] ' + $(if ($upgrade) { 'winget upgrade --id OpenJS.NodeJS.LTS' } else { 'winget install --id OpenJS.NodeJS.LTS' }))
            return $true
        }
        if ($upgrade) {
            winget upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
            # upgrade 对未装的包会报错，补一次 install
            if (-not (Find-NodeExes | Where-Object { (Get-NodeMajor $_) -ge $MinMajor })) {
                winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
            }
        } else {
            winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
        }
        return $true
    }
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Say '检测到 Chocolatey，开始处理…'
        if ($DryRun) { Say ('[DryRun] choco ' + $(if ($upgrade) { 'upgrade' } else { 'install' }) + ' nodejs-lts -y'); return $true }
        choco upgrade nodejs-lts -y | Out-Null
        return $true
    }
    if (Get-Command scoop -ErrorAction SilentlyContinue) {
        Say '检测到 Scoop，开始处理…'
        if ($DryRun) { Say ('[DryRun] scoop ' + $(if ($upgrade) { 'update' } else { 'install' }) + ' nodejs-lts'); return $true }
        scoop install nodejs-lts | Out-Null
        return $true
    }
    return $false
}

function Start-Solver([string]$nodeExe) {
    if ($DryRun) { Say "[DryRun] 会用 $nodeExe 运行 start.mjs"; exit 0 }
    & $nodeExe $SolveScript
    exit $LASTEXITCODE
}

Write-Host ''
Write-Host '[准备] 检查 Node.js'

# ── 1. 已经有达标的？直接用
$found = Find-NodeExes
foreach ($exe in $found) {
    $major = Get-NodeMajor $exe
    if ($major -ge $MinMajor) {
        Good "找到 Node v$major（$exe）"
        Start-Solver $exe
    }
}

$tooOld = $found | Where-Object { (Get-NodeMajor $_) -gt 0 -and (Get-NodeMajor $_) -lt $MinMajor }
$isUpgrade = [bool]$tooOld
if ($tooOld) {
    Warn2 "已有 Node 但版本低于 $MinMajor，需要升级"
} else {
    Warn2 '没有检测到 Node.js，开始自动安装'
}

# ── 2. 装/升级
$installed = Try-PackageManagers $isUpgrade
$nodeExe = $null

if ($installed) {
    # 包管理器装完，PATH 不一定刷新，把常见目录补上再找
    $env:PATH = "$env:ProgramFiles\nodejs;$env:LOCALAPPDATA\Programs\nodejs;$env:PATH"
    foreach ($exe in (Find-NodeExes)) {
        if ((Get-NodeMajor $exe) -ge $MinMajor) { $nodeExe = $exe; break }
    }
}

if (-not $nodeExe) {
    $zipExe = Install-ByZip
    if ($zipExe -and (Get-NodeMajor $zipExe) -ge $MinMajor) { $nodeExe = $zipExe }
}

# ── 3. 结果
if ($nodeExe) {
    Good "Node 就绪：$nodeExe"
    Start-Solver $nodeExe
}

Write-Host ''
Warn2 '自动安装没能成功'
Write-Host ''
Write-Host '    请手动处理一下，然后重新双击 start.bat：'
Write-Host '      1. 打开 https://nodejs.org/'
Write-Host '      2. 下载 LTS 版本（.msi），一路下一步装完'
Write-Host '      3. 关掉这个窗口，重新双击 start.bat'
Write-Host ''
if (-not $DryRun) { Start-Process 'https://nodejs.org/' }
exit 1
