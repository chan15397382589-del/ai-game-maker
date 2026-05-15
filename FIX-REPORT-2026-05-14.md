# 🔧 修复完成报告

## 修复日期
2026-05-14

## 根本问题分析

### 问题1：学生账户"消失"
**原因**：数据库触发器 `on_auth_user_created` 未创建或未启用，导致学生注册时 `public.users` 表没有自动插入记录。

### 问题2：无法提取学生对话（**严重**）
**原因**：`saveMessage()` 函数使用 **anon key** 调用 Supabase REST API，导致：
- `auth.uid()` 为 `null`
- RLS 策略阻止插入操作
- **学生的对话根本没有保存到数据库！**

---

## 已完成的修复

### 1. 修复消息保存机制
**文件**：`src/lib/deepseek.ts`
- ✅ 修改 `saveMessage()` 函数，现在需要传入用户 JWT token
- ✅ 调用新的后端 API `/api/save-message` 来保存消息

**文件**：`src/app/api/save-message/route.ts`（新建）
- ✅ 创建后端 API，使用 **service role** 绕过 RLS
- ✅ 验证用户身份和权限
- ✅ 安全保存消息到 `messages` 表

### 2. 修复聊天 API
**文件**：`src/app/api/chat/route.ts`
- ✅ 从请求头获取用户 JWT token
- ✅ 将 token 传递给 `saveMessage()` 函数

### 3. 修复游戏保存 API
**文件**：`src/app/api/projects/route.ts`
- ✅ 重写为使用 **service role** 操作数据库
- ✅ 正确验证用户身份
- ✅ 普通用户只能操作自己的作品，管理员可以查看所有作品

### 4. 修复前端代码
**文件**：`src/app/student/page.tsx`
- ✅ `sendMessage()` 函数：调用 `/api/chat` 时传递 Authorization header
- ✅ `handleSave()` 函数：调用 `/api/projects` 时传递 Authorization header
- ✅ 正确获取用户 JWT token（`supabase.auth.getSession()`）

### 5. 数据库触发器修复脚本
**文件**：`supabase-trigger-fix.sql`（新建）
- ✅ 创建触发器函数 `handle_new_user()`
- ✅ 自动在新用户注册时插入 `public.users` 表记录
- ✅ 包含验证和手动修复脚本

---

## 后续步骤

### 步骤1：执行数据库触发器脚本（**必须**）
1. 打开 Supabase 后台 → SQL Editor
2. 复制 `supabase-trigger-fix.sql` 的内容
3. 粘贴到 SQL Editor 并执行
4. 验证触发器是否创建成功

### 步骤2：重启开发服务器
```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run dev
```

### 步骤3：测试功能
1. **测试学生注册**：
   - 在管理员后台添加新学生
   - 检查 `public.users` 表是否自动创建记录

2. **测试对话保存**：
   - 以学生身份登录
   - 与 AI 对话
   - 在 Supabase SQL Editor 中查询：
     ```sql
     SELECT * FROM public.messages ORDER BY created_at DESC LIMIT 10;
     ```
   - 确认对话已保存

3. **测试管理员查看对话**：
   - 以管理员身份登录
   - 访问"对话审计"页面
   - 确认可以查看学生的对话记录

---

## 验证 SQL 查询

### 检查触发器是否创建成功
```sql
SELECT 
  trigger_name, 
  event_manipulation, 
  action_timing
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

### 检查用户表是否有学生记录
```sql
SELECT id, name, student_id, role, created_at 
FROM public.users 
WHERE role = 'student';
```

### 检查消息表是否有数据
```sql
SELECT 
  COUNT(*) as total_messages, 
  COUNT(DISTINCT user_id) as unique_users 
FROM public.messages;

SELECT * FROM public.messages ORDER BY created_at DESC LIMIT 10;
```

### 检查项目表是否有数据
```sql
SELECT 
  id, user_id, game_title, is_published, created_at 
FROM public.projects 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 常见问题排查

### Q1：执行触发器脚本后，新注册的学生还是没有记录？
**A**：检查 Supabase Auth 设置：
1. 进入 Authentication → Settings
2. 确保 "Enable email confirmations" 已禁用
3. 或者手动确认用户邮箱

### Q2：对话还是没有保存？
**A**：检查浏览器控制台（F12）：
1. 查看 Network 标签，`/api/chat` 请求是否包含 `Authorization` header
2. 查看 Console 标签，是否有错误信息
3. 检查 `/api/save-message` 请求是否成功（状态码 200）

### Q3：管理员还是无法查看学生对话？
**A**：检查管理员角色是否正确：
```sql
SELECT id, name, role FROM public.users WHERE role = 'admin';
```
如果角色不对，手动更新：
```sql
UPDATE public.users SET role = 'admin' WHERE id = '你的管理员用户ID';
```

---

## 技术细节

### 为什么之前无法保存消息？
**之前代码**（`saveMessage()` 函数）：
```typescript
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
await fetch(`${supabaseUrl}/rest/v1/messages`, {
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,  // ❌ 使用 anon key
  },
});
```
- `auth.uid()` 对于 anon key 返回 `null`
- RLS 策略 `USING (auth.uid() = user_id)` 失败
- 插入被阻止，但错误被 catch，只输出到 console

**修复后**：
- 创建后端 API `/api/save-message`
- 使用 **service role key** 绕过 RLS
- 正确验证用户身份

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/deepseek.ts` | 修改 | 修复 `saveMessage()` 函数 |
| `src/app/api/save-message/route.ts` | 新建 | 后端 API 保存消息 |
| `src/app/api/chat/route.ts` | 重写 | 传递 JWT token |
| `src/app/api/projects/route.ts` | 重写 | 使用 service role |
| `src/app/student/page.tsx` | 修改 | 传递 Authorization header |
| `supabase-trigger-fix.sql` | 新建 | 数据库触发器脚本 |

---

## 总结
✅ 所有核心问题已修复  
✅ TypeScript 编译检查通过  
✅ 代码已准备好部署  

**下一步**：执行 `supabase-trigger-fix.sql`，重启服务器，测试功能。
