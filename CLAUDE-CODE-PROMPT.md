# Claude Code 项目启动指令

## 使用方式

将以下「启动提示词」部分的内容，直接粘贴到 Claude Code 的第一条消息中即可。

---

## 启动提示词

```
你好，请接手这个 AI 教育游戏平台的开发工作。以下是完整的项目上下文，请仔细阅读后等待我的具体指令。

## 项目基本信息

- **项目名称**：AI 游戏创作课堂 (ai-game-classroom)
- **项目路径**：`C:\Users\DELL\WorkBuddy\2026-05-13-task-5`
- **定位**：面向小学三、四年级的信息技术教学平台
- **核心功能**：学生通过 AI 对话（选择题引导）逐步生成 HTML5 游戏，教师管理学生、审核作品

## 技术栈

- Next.js 16 (App Router) + React 18 + TypeScript 5
- Tailwind CSS 3.3
- Supabase (Auth + PostgreSQL + RLS) — 项目地址：https://fyocfhjjiazjgdxdaxur.supabase.co
- DeepSeek Chat API（通过 OpenAI SDK 兼容调用）
- 包管理器：npm，Node.js 25.2.1

## 启动项目

```bash
cd C:\Users\DELL\WorkBuddy\2026-05-13-task-5
npm run dev
# 访问 http://localhost:3000
```

注意：访问 DeepSeek API 可能需要代理 127.0.0.1:7897。

## 架构概览

### 双角色系统
- **学生端** (`/student`)：左侧 AI 聊天 + 右侧 iframe 游戏预览（代码/游戏 Tab 切换）
- **管理员端** (`/admin`)：学生管理、对话审计、作品审核三个 Tab 模块

### 数据库（4 张表）
1. `users` — 用户信息（含 role: student/admin, 学号, 年级, 班级）
2. `messages` — AI 对话记录（含 session_id 分组）
3. `conversations` — 对话文档（每位学生最多 2 个，存储游戏代码）
4. `projects` — 游戏作品（含发布状态）

### API 路由（17 个）
- `/api/chat` — 核心 SSE 流式聊天（DeepSeek）
- `/api/student/sessions` — 对话文档 CRUD
- `/api/student/messages` — 消息查询（需 session_id）
- `/api/projects` — 作品 CRUD
- `/api/save-message` — 手动保存消息
- `/api/admin/*` — 管理员 API（学生管理、消息查看、作品管理）

## ⚠️ 最关键的技术约束

### 1. DeepSeek 消息角色约束
DeepSeek API 要求 messages 中 user/assistant 交替，最后一条必须是 user。
**绝对不要**在 messages 数组中追加 assistant 消息。当前游戏代码通过 system prompt 注入（见 `src/lib/deepseek.ts` 第 89-101 行）。

### 2. rawMessagesRef 必须同步
前端显示用的 `messages` 经 `extractTextOnly()` 处理后代码被移除。必须用 `rawMessagesRef.current` 保存完整原始消息（含代码），发给 API 用。所有修改 `messages` 的地方必须同步更新 `rawMessagesRef`，否则修改功能失效。

### 3. 发送互斥锁用 useRef
```tsx
const sendingRef = useRef(false);  // ✅ 正确，同步
// 不要用 useState 做并发锁，state 更新是异步的
```

### 4. 消息 Key 策略
```tsx
// ✅ 正确
key={`msg-${i}-${msg.role}-${msg.content.length}`}
// ❌ 不要用 index 做 key
```

## 关键文件速查

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/app/student/page.tsx` | ~1090 | 学生端核心页面（聊天+预览+对话管理） |
| `src/app/admin/page.tsx` | ~1156 | 管理员后台（3 个 Tab 模块） |
| `src/lib/deepseek.ts` | ~180 | DeepSeek API 封装 + System Prompt + 消息保存 |
| `src/lib/admin-auth.ts` | ~60 | 管理员身份验证中间件 |
| `src/components/SupabaseProvider.tsx` | ~50 | Supabase 客户端 + Auth 监听 |
| `src/app/api/chat/route.ts` | ~100 | SSE 流式聊天核心 API |

## 已修复的 Bug（请勿回归）

1. rawMessagesRef 未同步 → 修改功能失效
2. DeepSeek messages 角色违反 → API 报错
3. currentCode 正则匹配 → 改为 system prompt 注入
4. loading state 做并发锁 → 改为 useRef
5. chat API userId 从客户端传 → 改为从 token 解析
6. 流式错误未捕获 → 加 try/catch
7. Supabase 客户端未单例化 → 模块级单例
8. getToken 无刷新 → 加 refreshSession
9. messages API 无 session_id → 可能全表查询
10. 消息 key 用 index → 并发错位
11. revokeObjectURL 立即释放 → 延迟 1 秒
12. 重试无上下文 → 带完整历史
13. AI 输出 @image# 占位符 → 过滤
14. 代码块未闭合 → HTML 提取失败
15. 管理员自动升级 → 安全漏洞已修复

## 学生登录邮箱格式

学生 email = `{学号}@ai-game.student`，登录时将学号拼成此格式。

## 环境变量

项目根目录 `.env.local` 文件包含：
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase URL（公开）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 匿名 Key（公开）
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 服务端 Key（私密）
- `DEEPSEEK_API_KEY` — DeepSeek API Key（私密）

## 操作习惯

- 每次只聚焦一个问题，增量修复
- 修改后用 `curl localhost:3000/student` 验证页面可用
- 不要删除 `.workbuddy` 文件夹
- 部署于阿里云，不使用 Vercel

## 详细文档

完整操作手册在 `CLAUDE-CODE-MANUAL.md`（约 570 行），包含数据库 Schema、所有 API 请求/响应格式、每个页面的状态变量和函数说明、全局 CSS 类、SQL 迁移文件列表等详细信息。遇到不确定的问题时，请先查阅该文件。

---
我已了解以上全部内容，准备好接收你的具体开发指令了。
```

---

## 使用说明

1. 打开 Claude Code
2. 将上面代码块中的全部内容复制粘贴进去
3. Claude Code 读取完毕后会回复"已了解"
4. 之后你可以直接告诉它具体要做什么，比如：
   - "帮我修复学生端无法在已有游戏上继续修改的 bug"
   - "给管理员后台加一个数据统计仪表板"
   - "优化学生端的 UI 布局"
   - "给游戏预览增加全屏按钮"
