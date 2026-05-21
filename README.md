# 🎮 AI 游戏创作课堂

小学生通过 AI 对话生成 HTML 网页游戏的教育平台。

## 功能模块

### 学生端（Student Portal）
- 💬 与 AI「小智老师」对话，用自然语言描述游戏创意
- 👀 实时预览区，AI 生成的游戏代码自动渲染到 iframe
- 🚀 一键发布游戏作品到班级展示墙

### 教师后台（Admin Dashboard）
- 👥 学生账号管理（批量创建、查看学习进度）
- 💬 对话记录审计（以聊天气泡形式回溯学生的思维过程）
- 🎮 作品审核与预览（瀑布流展示 + iframe 弹窗体验）

## 🚀 快速开始

### 第一步：配置 Supabase 数据库

1. 打开 [supabase.com](https://supabase.com) → 进入你的项目
2. 左侧菜单 → **SQL Editor**
3. 复制项目根目录下的 `supabase-schema.sql` 文件内容
4. 粘贴到 SQL Editor，点击 **Run** 执行
5. 执行完成后，在 **Table Editor** 中可以看到三张表：`users`、`messages`、`projects`

### 第二步：配置环境变量

复制 `.env.local.example` 为 `.env.local`，填入你的配置：

```bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://fyocfhjjiazjgdxdaxur.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_anon_key（eyJ开头的长字符串）

# DeepSeek API Key
DEEPSEEK_API_KEY=你的_DeepSeek_API_Key（sk-开头）
```

> ⚠️ **获取 Supabase Anon Key**：Supabase 后台 → Settings → API → 找到 `anon` `public` 那一栏，点击眼睛图标复制

### 第三步：安装依赖并启动

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问！

## 📋 初始化第一个管理员账号

1. 先以普通学生身份注册一个账号
2. 打开 Supabase → Table Editor → `users` 表
3. 找到你刚注册的账号，把 `role` 字段改为 `admin`
4. 刷新页面，重新登录，即可进入教师后台

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) + React 18 + TypeScript |
| 样式 | Tailwind CSS |
| 后端/数据库 | Supabase (PostgreSQL + Auth + RLS) |
| AI | DeepSeek API (deepseek-chat) |

## 📁 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # AI 对话接口（SSE 流式）
│   │   └── projects/route.ts   # 游戏作品 CRUD
│   ├── admin/page.tsx           # 教师后台
│   ├── student/page.tsx         # 学生创作平台
│   ├── login/page.tsx           # 登录/注册
│   └── layout.tsx               # 全局布局
├── components/
│   └── SupabaseProvider.tsx     # Supabase 客户端
└── lib/
    ├── supabase.ts              # Supabase 服务端配置
    └── deepseek.ts              # DeepSeek API 封装
```

## 🌐 部署到 Vercel（发布到互联网）

1. 把代码推送到 GitHub 仓库
2. 打开 [vercel.com](https://vercel.com) → 导入 GitHub 仓库
3. 在 Vercel 项目设置中填入环境变量（同 `.env.local`）
4. 点击 Deploy，等待 2 分钟，获得一个 `https://xxx.vercel.app` 的网址
5. 分享给学生们，他们就能在教室/家里访问了！🎉
