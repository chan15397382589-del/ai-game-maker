@echo off
title AI 游戏创作课堂 - 便携版
cd /d "%~dp0"

echo ========================================
echo   AI 游戏创作课堂 - 便携版启动器
echo ========================================
echo.

:: ========== 检测 Node.js ==========
echo [1/3] 检测 Node.js 环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到 Node.js！
    echo.
    echo 请先安装 Node.js：
    echo 步骤1：打开 https://nodejs.org
    echo 步骤2：点击左侧 LTS 版本下载
    echo 步骤3：运行安装包，一路"下一步"即可
    echo.
    pause
    exit /b
)
echo ✅ Node.js 版本：
node -v
echo.

:: ========== 检查环境变量 ==========
echo [2/3] 检查配置文件...
if not exist ".env" (
    echo ⚠️ 正在创建配置文件...
    (
        echo NEXT_PUBLIC_SUPABASE_URL=https://fyocfhjjiazjgdxdaxur.supabase.co
        echo NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5b2NmaGpqaWF6amdkeGRheHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzA2MTYsImV4cCI6MjA5NDI0NjYxNn0.5aA5vChTVjxIil2X0qWuNFsazYBKsdNlMJC8tm9pun0
        echo SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5b2NmaGpqaWF6amdkeGRheHVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY3MDYxNiwiZXhwIjoyMDk0MjQ2NjE2fQ.k2wBbiJM5XFuwxF4A44GGkziXmX2GEGrHWhClUOZGf8
        echo DEEPSEEK_API_KEY=sk-8cdb0befba1f4d8c9c45a46b34d169f5
        echo NEXT_PUBLIC_SITE_URL=http://localhost:3000
    ) > .env
    echo ✅ 配置文件已创建
) else (
    echo ✅ 配置文件已存在
)
echo.

:: ========== 安装依赖 ==========
echo [3/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖（首次需要，约 1-2 分钟）...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 安装失败，请检查网络连接后重试
        pause
        exit /b
    )
    echo ✅ 依赖安装完成
) else (
    echo ✅ 依赖已就绪
)
echo.

:: ========== 启动 ==========
echo.
echo 🌐 正在启动服务器...
echo ✅ 启动完成！正在打开浏览器...
echo.
echo 💡 如果浏览器没有自动打开，请手动访问 http://localhost:3000
echo.
echo ⏹️  关闭此窗口即可停止服务器
echo.

start http://localhost:3000
npm run dev
pause
