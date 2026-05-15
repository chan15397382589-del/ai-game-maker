@echo off
title AI 游戏创作课堂
cd /d "%~dp0"

echo ========================================
echo   AI 游戏创作课堂 - 一键启动
echo ========================================
echo.
echo [1/2] 正在启动服务器...

:: 启动 Next.js 开发服务器（后台运行）
start "" cmd /c "npm run dev"

echo [2/2] 等待服务器启动...
timeout /t 5 /nobreak >nul

:: 打开浏览器
start http://localhost:3000

echo ✅ 服务器已启动！正在打开浏览器...
echo.
echo 💡 如果要停止服务器，请关闭命令行窗口
echo.
echo 📌 管理员登录：http://localhost:3000/login
echo 📌 学生登录：  http://localhost:3000/login
echo.
pause
