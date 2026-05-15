-- ============================================
-- 教师管理后台完整修复 SQL
-- 请在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

-- ============================================================
-- 第 1 步：创建 SECURITY DEFINER 函数解决 RLS 无限递归
-- ============================================================
-- 原始策略用 EXISTS(SELECT FROM public.users) 会触发 users 表自身的 RLS → 无限递归
-- 解决方案：用 SECURITY DEFINER 函数绕过 RLS

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 通用权限检查函数（备用）
CREATE OR REPLACE FUNCTION public.is_table_owner(table_name text, user_id_column text)
RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 第 2 步：删除所有旧的 RLS 策略（避免冲突）
-- ============================================================
DROP POLICY IF EXISTS "管理员可以查看所有用户信息" ON public.users;
DROP POLICY IF EXISTS "用户可以查看自己的信息" ON public.users;
DROP POLICY IF EXISTS "用户可以更新自己的信息" ON public.users;
DROP POLICY IF EXISTS "用户可以插入自己的记录" ON public.users;
DROP POLICY IF EXISTS "管理员可以访问所有对话" ON public.messages;
DROP POLICY IF EXISTS "用户可以访问自己的对话" ON public.messages;
DROP POLICY IF EXISTS "学生可以管理自己的作品" ON public.projects;
DROP POLICY IF EXISTS "管理员可以审核所有作品" ON public.projects;
DROP POLICY IF EXISTS "所有人可以查看已发布的作品" ON public.projects;

-- ============================================================
-- 第 3 步：重新创建所有表的正确 RLS 策略
-- ============================================================

-- === users 表策略 ===

-- 自己可以查看自己的信息
CREATE POLICY "用户可以查看自己的信息" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- 管理员可以查看所有用户（使用 SECURITY DEFINER 函数）
CREATE POLICY "管理员可以查看所有用户信息" ON public.users
  FOR SELECT USING (public.is_admin());

-- 自己可以更新自己的信息
CREATE POLICY "用户可以更新自己的信息" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- 注册时可以插入自己的记录
CREATE POLICY "用户可以插入自己的记录" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- === messages 表策略 ===

-- 学生/用户只能访问自己的对话
CREATE POLICY "用户可以访问自己的对话" ON public.messages
  FOR ALL USING (auth.uid() = user_id);

-- 管理员可以访问所有对话
CREATE POLICY "管理员可以访问所有对话" ON public.messages
  FOR ALL USING (public.is_admin());

-- === projects 表策略 ===

-- 学生可以管理自己的作品
CREATE POLICY "学生可以管理自己的作品" ON public.projects
  FOR ALL USING (auth.uid() = user_id);

-- 【关键修复】管理员可以查看和审核所有作品（含未发布）
CREATE POLICY "管理员可以审核所有作品" ON public.projects
  FOR ALL USING (public.is_admin());

-- 所有人可以查看已发布的作品
CREATE POLICY "所有人可以查看已发布的作品" ON public.projects
  FOR SELECT USING (is_published = TRUE);

-- ============================================================
-- 第 4 步：确认 RLS 已启用
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 验证步骤（执行后检查输出）
-- ============================================================
-- 检查函数是否创建成功：
-- SELECT proname FROM pg_proc WHERE proname IN ('is_admin', 'is_table_owner');

-- 检查策略是否生效：
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';
