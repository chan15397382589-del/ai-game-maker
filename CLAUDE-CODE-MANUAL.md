# AI 游戏创作课堂 — Claude Code 操作手册

> 本文档为 Claude Code (或任何接手本项目的 AI 编码助手) 提供完整的项目上下文。
> 项目路径：`C:\Users\DELL\WorkBuddy\2026-05-13-task-5`

---

## 一、项目概述

**名称**：AI 游戏创作课堂 (ai-game-classroom)
**定位**：面向小学三、四年级的信息技术教学平台
**目标用户**：学生（通过 AI 对话创作 HTML5 网页游戏）+ 教师/管理员（管理学生、审核作品、审计对话）

**核心功能流程**：
1. 管理员通过 Excel 批量导入学生账号
2. 学生用学号+密码登录
3. 学生通过 AI 对话（选择题引导）逐步生成 HTML5 游戏代码
4. 生成的游戏在右侧 iframe 中实时预览
5. 学生可上传作品到教师后台、下载 HTML 文件
6. 管理员可查看学生对话记录、审核/删除游戏作品

---

## 二、技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Next.js** | 16.2.6 | 全栈框架 (App Router) |
| **React** | 18 | UI 库 |
| **TypeScript** | 5 | 类型安全 |
| **Tailwind CSS** | 3.3.0 | 样式框架 |
| **Supabase** | 2.39.3 | Auth + PostgreSQL + RLS |
| **OpenAI SDK** | 4.28.0 | DeepSeek API 兼容客户端 |
| **xlsx** | 0.18.5 | Excel 导入导出 |

**运行时**：Node.js 25.2.1, Python 3.14.2（系统可用）
**包管理器**：npm
**开发服务器**：`npm run dev`（端口 3000，使用 Turbopack）

---

## 三、环境变量 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL        -- Supabase 项目 URL（公开，前端使用）
NEXT_PUBLIC_SUPABASE_ANON_KEY   -- Supabase 匿名 Key（公开，受 RLS 保护）
SUPABASE_SERVICE_ROLE_KEY       -- Supabase 服务端 Key（私密，绕过 RLS）
DEEPSEEK_API_KEY                -- DeepSeek AI API Key（私密）
```

**Supabase 项目地址**：https://fyocfhjjiazjgdxdaxur.supabase.co

---

## 四、目录结构

```
src/
├── app/
│   ├── layout.tsx              -- 根布局，引入 SupabaseProvider + 字体
│   ├── page.tsx                -- 首页（角色路由跳转：admin→/admin, student→/student）
│   ├── globals.css             -- 全局样式（Tailwind + 自定义组件类）
│   ├── login/page.tsx          -- 登录页（学生用学号登录，管理员用邮箱登录）
│   ├── student/page.tsx        -- 学生端主页面（~1090行，核心页面）
│   ├── admin/page.tsx          -- 管理员后台（~1156行，包含3个子模块）
│   └── api/
│       ├── chat/route.ts              -- 核心：DeepSeek 流式聊天 SSE
│       ├── projects/route.ts          -- 游戏作品 CRUD（学生端）
│       ├── save-message/route.ts      -- 手动保存单条消息
│       ├── debug-auth/route.ts        -- Supabase 连接诊断
│       ├── student/
│       │   ├── messages/route.ts      -- 学生获取自己的消息（需 session_id）
│       │   └── sessions/route.ts      -- 对话文档 CRUD
│       └── admin/
│           ├── init/route.ts          -- 管理员初始化检测
│           ├── messages/route.ts      -- 管理员查看学生对话
│           ├── projects/route.ts      -- 管理员作品管理（查看/发布/删除）
│           ├── sessions/route.ts      -- 管理员查看会话（按30分钟间隔分组）
│           ├── students/route.ts      -- 学生 CRUD + 批量导入
│           └── students/reset-password/route.ts -- 批量重置密码
├── components/
│   └── SupabaseProvider.tsx   -- Supabase 客户端初始化 + Auth 状态监听
└── lib/
    ├── supabase.ts           -- 前端 Supabase 客户端（anon key）
    ├── admin-auth.ts         -- 管理员身份验证中间件
    └── deepseek.ts           -- DeepSeek API 封装 + System Prompt + 消息保存
```

**项目根目录其他文件**：
- `supabase-*.sql` — 数据库迁移脚本（按时间顺序执行）
- `启动.bat` / `启动游戏课堂.bat` / `便携版启动器.bat` — 一键启动脚本
- `next.config.js` — 空配置（无特殊设置）
- `tailwind.config.js` — 自定义颜色 primary=#4F46E5, secondary=#F59E0B
- `postcss.config.js` — PostCSS 配置（Tailwind + autoprefixer）
- `tsconfig.json` — TypeScript 配置
- `AI游戏创作课堂.url` — 浏览器快捷方式

---

## 五、数据库表结构 (Supabase PostgreSQL)

### 5.1 users 表

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID (PK, FK→auth.users) | Supabase Auth 用户 ID |
| name | VARCHAR(100) | 姓名 |
| student_id | VARCHAR(50) UNIQUE | 学号（admin 固定为 "admin"） |
| role | VARCHAR(20) | `student` / `admin` |
| gender | VARCHAR(10) | 性别（增量迁移添加） |
| grade | INTEGER | 年级 3-6（增量迁移添加） |
| class_num | INTEGER | 班级 1-10（增量迁移添加） |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间（自动触发器） |

### 5.2 messages 表

| 列 | 类型 | 说明 |
|----|------|------|
| id | BIGSERIAL (PK) | 自增 ID |
| user_id | UUID (FK→users) | 所属用户 |
| role | VARCHAR(20) | `user` / `assistant` |
| content | TEXT | 消息内容（**含完整代码**，数据库存原始内容） |
| session_id | UUID (可空) | 会话分组 ID（增量迁移添加） |
| created_at | TIMESTAMPTZ | 创建时间 |

**索引**：user_id, created_at DESC

### 5.3 conversations 表（对话文档）

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID (PK, DEFAULT gen_random_uuid()) | 对话文档 ID |
| user_id | UUID (FK→auth.users) | 所属学生 |
| title | VARCHAR(200) | 标题（默认 "新对话"，首条消息自动更新） |
| html_code | TEXT | 当前游戏代码（学生端实时更新） |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间（自动触发器） |

**约束**：每位学生最多 2 个对话文档

### 5.4 projects 表（游戏作品）

| 列 | 类型 | 说明 |
|----|------|------|
| id | BIGSERIAL (PK) | 自增 ID |
| user_id | UUID (FK→users) | 作者 |
| game_title | VARCHAR(200) | 游戏标题 |
| html_code | TEXT | 完整 HTML5 游戏代码 |
| is_published | BOOLEAN | 是否发布（默认 false） |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间（自动触发器） |

### 5.5 RLS 行级安全策略

| 表 | 策略 |
|----|------|
| users | 学生查看/更新自己；管理员查看全部 |
| messages | 学生操作自己的 (FOR ALL)；管理员操作全部 |
| conversations | 学生操作自己的 (FOR ALL)；管理员查看全部 (SELECT) |
| projects | 学生管理自己的 (FOR ALL)；所有人查看已发布 (SELECT) |

### 5.6 SQL 迁移文件（按顺序执行）

| 文件 | 内容 |
|------|------|
| `supabase-schema.sql` | 初始表结构 (users, messages, projects) + RLS + 触发器 |
| `supabase-add-session.sql` | messages 表增加 session_id 列 |
| `supabase-add-conversations.sql` | 新建 conversations 表 |
| `supabase-add-grade-class.sql` | users 表增加 gender/grade/class_num 列 |
| `supabase-admin-fix.sql` | 管理员初始化修复 |
| `supabase-register-fix.sql` | 注册流程修复 |
| `supabase-rls-fix.sql` | RLS 策略修复 |
| `supabase-trigger-fix.sql` | 触发器修复 |
| `supabase-diagnose.sql` | 诊断查询 |

---

## 六、前端页面详解

### 6.1 根布局 (layout.tsx)

- 设置 `<html lang="zh-CN">`
- 引入 Inter 字体
- 包裹 `SupabaseProvider`
- 标题 "AI 游戏创作课堂"

### 6.2 首页 (page.tsx)

- 检查 Auth 状态，未登录跳 `/login`
- 根据 users.role 跳转：admin → `/admin`，其他 → `/student`
- 仅显示 "正在跳转..." 加载状态

### 6.3 登录页 (login/page.tsx)

- **双模式切换**：学生登录（学号+密码） / 管理员登录（邮箱+密码）
- 学生登录：学号拼成 `{学号}@ai-game.student` 作为 email
- 管理员登录：直接用邮箱
- 登录后验证 role 匹配，不匹配则报错（防止学生用管理员入口登录反之亦然）
- 使用 `supabase.auth.signInWithPassword()`

### 6.4 学生端页面 (student/page.tsx) ⭐ 最核心

**页面布局**（左右 50% 对半）：
```
┌──────────────────────────┬──────────────────────────┐
│        聊天区（左侧）      │      预览区（右侧）       │
│  ┌────────────────────┐  │  ┌────────────────────┐  │
│  │ 标题栏（退出登录）   │  │  │ 标题栏 + Tab切换    │  │
│  ├────────────────────┤  │  │ + 上传/下载按钮     │  │
│  │                    │  │  ├────────────────────┤  │
│  │  消息列表           │  │  │ 文件管理折叠面板    │  │
│  │  （聊天气泡 +       │  │  │ （对话文档列表）    │  │
│  │   选项按钮）        │  │  ├────────────────────┤  │
│  │                    │  │  │                    │  │
│  │                    │  │  │  代码视图 /         │  │
│  │                    │  │  │  游戏视图           │  │
│  │                    │  │  │  （Tab 切换）       │  │
│  ├────────────────────┤  │  │                    │  │
│  │ 输入框 + 发送按钮   │  │  │                    │  │
│  └────────────────────┘  │  └────────────────────┘  │
└──────────────────────────┴──────────────────────────┘
```

**核心状态变量**：
| 变量 | 类型 | 用途 |
|------|------|------|
| `messages` | `{role, content}[]` | 显示用的消息列表（代码已清除） |
| `rawMessagesRef` | `useRef<{role, content}[]>` | **原始消息列表**（含完整代码，发给 API 用） |
| `htmlCode` | `string` | 当前游戏 HTML 代码 |
| `viewMode` | `"code" \| "game"` | 右侧 Tab 切换状态 |
| `gameStarted` | `boolean` | 游戏是否已开始（点击"开始游戏"后为 true） |
| `isCoding` | `boolean` | AI 是否正在生成代码块 |
| `liveCode` | `string` | 流式输出中的实时代码预览 |
| `currentConvId` | `string` | 当前对话文档 ID |
| `conversations` | `Conversation[]` | 对话文档列表 |
| `sendingRef` | `useRef<boolean>` | 发送互斥锁（防止重复发送） |
| `retryCountRef` | `useRef<number>` | 自动重试计数器 |

**关键函数**：
| 函数 | 用途 |
|------|------|
| `getToken()` | 获取 Auth token，过期时自动 refreshSession |
| `doSend(text)` | 发送消息统一入口（创建对话→构建 API 消息→调用 API→流式处理） |
| `processStream()` | 处理 SSE 流式响应（逐块解析→检测代码块→更新显示→提取代码） |
| `fetchConversations()` | 获取对话文档列表 |
| `loadConversation()` | 加载指定对话（恢复消息 + 游戏代码） |
| `startNewConversation()` | 新建对话 |
| `deleteConversation()` | 删除对话及其消息 |
| `updateConversationSilent()` | 静默更新对话（标题/代码），不弹错误 |
| `handleUpload()` | 上传游戏到教师后台 |
| `handleDownload()` | 下载 HTML 文件 |

**关键工具函数（页面顶部定义）**：
| 函数 | 用途 |
|------|------|
| `splitByCodeFences()` | 按 ``` 分割内容为代码部分和文本部分 |
| `looksLikeCode()` | 判断一行文本是否像代码（评分机制） |
| `extractTextOnly()` | 从内容中提取纯文本（去除代码块、Markdown 格式、AI 废话） |
| `extractAllCode()` | 从内容中提取所有代码行 |
| `cleanImageMarkers()` | 过滤 `@image#...` 图片占位符 |
| `extractHtmlCode()` | 从 AI 回复中提取完整 HTML 代码（多策略匹配） |
| `extractOptions()` | 从文本中提取选择题选项（`1. xxx` 格式） |

**视图自动切换逻辑**：
- AI 开始生成代码块 → 自动切换到「代码」视图
- 代码生成完成 → 1秒后自动切换到「游戏」视图
- 用户发送消息（已有游戏时）→ 切换到「代码」视图等待修改

**rawMessagesRef 同步要点**（最关键的坑）：
> 前端显示用的 `messages` 经 `extractTextOnly()` 处理后代码被移除。
> 如果用显示消息发给 API，AI 看不到之前生成的代码，修改功能完全失效。
> 所以必须用 `rawMessagesRef` 保存完整原始消息，所有修改 messages 的地方必须同步更新 rawMessagesRef：
> - `loadConversation()`：从数据库恢复时
> - `startNewConversation()`：新建对话时
> - `deleteConversation()`：删除后重置时
> - `doSend()`：用户发消息时
> - `processStream()`：流式结束后保存 AI 回复

### 6.5 管理员后台 (admin/page.tsx)

**三个 Tab 页**：

1. **👥 学生管理 (StudentsManagement)** — 最复杂
   - 左侧导航树：全部学生 → 年级 → 班级（三级结构）
   - 右侧数据面板：学生表格 + 搜索 + 批量操作
   - 功能：新增学生、Excel 批量导入（预览+确认两步）、批量删除、重置密码、导出 Excel、下载模板
   - 导入 Excel 模板格式：`序号 | 学生姓名 | 学号 | 班级 | 备注`
   - 班级列解析：支持 "1班"、"1"、"班1" 等格式

2. **💬 对话审计 (MessagesAudit)**
   - 选择学生 → 查看对话列表（按30分钟间隔分组）→ 查看消息详情
   - 支持导出对话记录为 txt 文件

3. **🎮 作品审核 (ProjectsReview)**
   - 作品列表表格（含作者信息）
   - 预览（iframe 弹窗）、下载、批量下载、批量删除

---

## 七、API 路由详解

### 7.1 认证方式

所有 API 统一从 `Authorization: Bearer <token>` 获取用户身份：
- **chat API**：从 token 解析 userId，不信任客户端传入的 userId
- **admin API**：使用 `getVerifiedAdmin()` 验证 admin role
- **student API**：使用 `supabaseAdmin.auth.getUser(token)` 验证

### 7.2 POST /api/chat — 核心流式聊天

**请求**：
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "sessionId": "uuid（可选，对话文档ID）",
  "currentCode": "html代码（可选，当前游戏代码）"
}
```
**Headers**：`Authorization: Bearer <token>`

**响应**：SSE 流 (`text/event-stream`)
```
data: {"content": "文本片段1"}
data: {"content": "文本片段2"}
data: {"error": "AI 回复中断"}
data: [DONE]
```

**副作用**：
- 自动保存用户消息和完整 AI 回复到 messages 表（含 session_id）
- currentCode 通过 system prompt 注入给 DeepSeek（不影响 messages 的角色交替）

### 7.3 GET/POST/PATCH/DELETE /api/student/sessions — 对话文档 CRUD

| 方法 | 用途 | 说明 |
|------|------|------|
| GET | 获取对话列表 | 返回对话 + 消息计数 |
| POST | 创建新对话 | 上限 2 个，标题默认 "新对话" |
| DELETE | 删除对话 | 同时删除关联的 messages |
| PATCH | 更新对话 | 可更新 title / html_code |

### 7.4 GET /api/student/messages — 获取消息

- **必须**提供 `session_id` query 参数（防止全表查询）
- 明确指定字段：`id, role, content, created_at, session_id`
- 按 `created_at` 升序排列

### 7.5 GET/POST /api/projects — 学生端作品

| 方法 | 用途 |
|------|------|
| GET | 获取作品列表（?user_id=xxx 筛选，不传则只返回自己的，admin 返回全部） |
| POST | 保存作品（user_id 必须等于 token 中的 userId） |

### 7.6 POST /api/save-message — 手动保存消息

**请求**：`{ userId, role, content }`
**权限**：userId 必须等于 token 中的 userId

### 7.7 GET /api/debug-auth — 诊断接口

无需认证，返回 Supabase 连接状态及 3 种连接测试结果。

### 7.8 管理员 API（均需 getVerifiedAdmin 验证）

| 路由 | 方法 | 功能 | 关键参数 |
|------|------|------|----------|
| `/api/admin/init` | POST | 检测/触发管理员初始化 | - |
| `/api/admin/students` | GET | 学生列表 | `?grade&class_num&keyword` |
| `/api/admin/students` | POST | 批量导入学生 | `{ students[], grade }` |
| `/api/admin/students` | DELETE | 删除学生 | `?userId=xxx` |
| `/api/admin/students` | PATCH | 更新学生 | `{ id, name?, student_id?, ... }` |
| `/api/admin/students/reset-password` | POST | 批量重置密码 | `{ student_ids[], password? }` |
| `/api/admin/messages` | GET | 学生对话记录 | `?user_id=xxx` |
| `/api/admin/sessions` | GET | 会话列表（30分钟分组） | `?user_id=xxx` |
| `/api/admin/projects` | GET | 所有作品 | - |
| `/api/admin/projects` | PATCH | 切换发布状态 | `{ id, is_published }` |
| `/api/admin/projects` | DELETE | 删除作品 | `{ id }` |

---

## 八、核心库文件详解

### 8.1 src/lib/deepseek.ts — DeepSeek API 封装

- **OpenAI SDK 兼容**：baseURL = `https://api.deepseek.com`，模型 = `deepseek-chat`
- **supabaseAdmin**：导出为模块级单例（service role key），供多个 API 复用
- **TEACHER_SYSTEM_PROMPT**：小智老师角色设定（约 80 行），包含：
  - 教学原则（浅显中文、鼓励尝试、逐步引导）
  - 对话格式要求（每次只问 1 个问题 + 3-4 个选项）
  - 代码生成要求（单文件 HTML5 Canvas/DOM、中文注释、适合 iframe）
  - 修改规则（基于已有代码修改、不重新生成不同游戏）
  - 禁止项（图片占位符、代码块外混入代码、不闭合代码块）
- **createChatCompletion()**：
  - 接收 messages 数组和可选的 currentCode
  - currentCode 通过 system prompt 注入（不影响 messages 的 user/assistant 交替）
  - 限制 currentCode < 30000 字符（避免超出上下文窗口）
  - 流式输出 (stream: true, temperature: 0.8)
- **saveMessage()**：
  - 使用 supabaseAdmin 直接写入 messages 表
  - 验证 sessionId 格式（有效 UUID）

### 8.2 src/lib/admin-auth.ts — 管理员验证中间件

- **getVerifiedAdmin(token)**：
  1. 用 token 调用 `supabase.auth.getUser(token)` 验证身份
  2. 查询 users 表检查 role = 'admin'
  3. 如果 users 表无记录 → 自动创建管理员记录（首次初始化）
  4. 严格检查：**不再自动升级非 admin 用户**（防止 session 混淆）
  5. 返回 `{ userId, userName }` 或 `NextResponse` 错误

### 8.3 src/components/SupabaseProvider.tsx

- 创建前端 Supabase 客户端（anon key）
- 监听 Auth 状态变化（onAuthStateChange）
- session 恢复失败时清除 localStorage 中的过期数据（`sb-` 和 `supabase.` 前缀）

### 8.4 src/lib/supabase.ts

- 导出前端 Supabase 客户端单例（供 login 等页面使用）

---

## 九、全局样式 (globals.css)

自定义 CSS 类（Tailwind @apply 实现）：

| 类名 | 用途 |
|------|------|
| `.edu-card` | 教育风格圆角卡片（白底、阴影、圆角 2xl） |
| `.chat-bubble-user` | 用户聊天气泡（蓝色、圆角、右对齐、最大宽度 80%） |
| `.chat-bubble-ai` | AI 聊天气泡（灰色、圆角、左对齐、最大宽度 80%） |
| `.code-block` | 深色代码块（灰底绿字、等宽字体） |
| `.btn-primary` | 主按钮（靛蓝色、圆角 xl） |
| `.btn-secondary` | 次要按钮（灰色） |
| `.input-field` | 输入框（圆角、聚焦高亮） |

---

## 十、常见陷阱与注意事项

### 10.1 DeepSeek API 消息角色约束（最致命）

**DeepSeek 要求 messages 数组中 user/assistant 交替出现，且最后一条必须是 user。**

错误做法（会导致 API 报错）：
```tsx
// 错误！在 apiMessages 末尾追加 assistant 消息
if (htmlCode) {
  apiMessages.push({ role: "assistant", content: currentCode });
}
```

正确做法：当前游戏代码通过 system prompt 注入，不占用 messages 数组（见 deepseek.ts 第 89-101 行）。

### 10.2 rawMessagesRef 必须同步

所有修改 `messages` state 的地方都必须同步更新 `rawMessagesRef`，否则：
- AI 看不到之前的游戏代码
- 修改功能完全失效
- 上下文丢失

### 10.3 发送互斥锁用 useRef

```tsx
// 正确：useRef 是同步的
const sendingRef = useRef(false);

// 错误：React state 更新是异步的，可能导致重复发送
const [sending, setSending] = useState(false);
```

### 10.4 消息 Key 策略

```tsx
// 错误：index 作 key，并发更新导致消息错位
<div key={i}>

// 正确：角色 + 内容长度组合
<div key={`msg-${i}-${msg.role}-${msg.content.length}`}>
```

### 10.5 Turbopack 缓存损坏

遇到 `Cannot find module '../chunks/ssr/[turbopack]_runtime.js'` 错误时：
1. 杀掉 dev server 进程
2. 删除 `.next/` 目录
3. 重新 `npm run dev`

### 10.6 URL.revokeObjectURL 延迟释放

```tsx
// 错误：立即释放，文件可能还没下载完
URL.revokeObjectURL(url);

// 正确：延迟 1 秒释放
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

### 10.7 Excel 导入频率限制

Supabase Auth 的 `signUp` 有频率限制（约每秒 1 次）。批量导入时：
- 每次请求间隔 600ms
- 触发频率限制后等待 3 秒重试
- 已存在的学号直接跳过

### 10.8 学生登录邮箱格式

学生账号的 email 格式为 `{学号}@ai-game.student`，登录时将学号拼成此格式。

---

## 十一、开发操作指南

### 启动开发服务器
```bash
cd C:\Users\DELL\WorkBuddy\2026-05-13-task-5
npm run dev
# 访问 http://localhost:3000
```

### 本地代理（访问 DeepSeek API 需要）
- 代理地址：`127.0.0.1:7897`
- 如果不需要代理，确保网络能直接访问 api.deepseek.com

### 部署
- 部署于阿里云服务器
- Vercel 在中国不可用，不使用 Vercel 部署
- 使用 `npm run build && npm run start` 或 PM2 管理进程

### 添加新页面/路由
- 使用 Next.js App Router 约定：`src/app/<path>/page.tsx`
- 所有需要 Auth 的页面在 useEffect 中调用 `supabase.auth.getUser()` 检查

### 添加新 API
- 路由文件放在 `src/app/api/<path>/route.ts`
- 导出 `GET`/`POST`/`PATCH`/`DELETE` 等命名函数
- 认证：学生 API 用 `supabaseAdmin.auth.getUser(token)`，管理员 API 用 `getVerifiedAdmin(token)`

---

## 十二、当前已修复的主要问题

以下是已经修复过的重要 bug，后续开发时不需要再修，但需注意不要回归：

1. ✅ rawMessagesRef 未同步导致修改功能失效
2. ✅ DeepSeek API 消息角色约束违反（assistant 在末尾）
3. ✅ currentCode 注入依赖关键词正则匹配（小学生表达可能匹配不到）
4. ✅ 竞态条件：用 loading state 做并发锁
5. ✅ chat API 的 userId 从客户端传入（安全漏洞，改为从 token 解析）
6. ✅ 流式错误未捕获（stream start 加 try/catch）
7. ✅ Supabase 客户端未单例化（每次 API 创建新连接）
8. ✅ getToken 无刷新机制（加 refreshSession）
9. ✅ messages API 缺少 session_id 校验（可能全表查询）
10. ✅ 消息 key 用 index 导致并发更新错位
11. ✅ URL.revokeObjectURL 立即释放导致下载失败
12. ✅ 自动重试发无上下文消息（改为带完整对话历史 + 代码上下文）
13. ✅ AI 输出图片占位符（@image#...）导致游戏无法显示
14. ✅ 代码块未闭合导致 HTML 提取失败
15. ✅ 管理员自动升级非 admin 用户为 admin（安全漏洞）

---

## 十三、后续可能的需求方向

- 教师端可能需要：游戏发布到展示墙、学生分组管理、课程管理
- 学生端可能需要：游戏模板库、多人协作、代码编辑器增强（语法高亮、自动补全）
- 平台可能需要：数据统计仪表板、AI 使用量监控、家长端查看
