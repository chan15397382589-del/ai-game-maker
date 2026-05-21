-- ============================================
-- 修复 RLS 无限递归问题
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 先删除有问题的策略
DROP POLICY IF EXISTS "管理员可以查看所有用户信息" ON public.users;
DROP POLICY IF EXISTS "管理员可以访问所有对话" ON public.messages;
DROP POLICY IF EXISTS "管理员可以访问所有对话" ON public.messages;

-- 方案：创建一个 security definer 函数来判断用户是否为管理员
-- 这样可以避免 RLS 递归

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 重新创建正确的策略（使用函数避免递归）

-- 用户表策略
CREATE POLICY "管理员可以查看所有用户信息" ON public.users
  FOR SELECT USING (is_admin());

CREATE POLICY "管理员可以更新所有用户信息" ON public.users
  FOR UPDATE USING (is_admin());

-- 对话记录策略（管理员）
CREATE POLICY "管理员可以查看所有对话" ON public.messages
  FOR SELECT USING (is_admin());

CREATE POLICY "管理员可以管理所有对话" ON public.messages
  FOR ALL USING (is_admin());

-- 游戏作品策略（管理员可以管理所有作品）
CREATE POLICY "管理员可以管理所有作品" ON public.projects
  FOR ALL USING (is_admin());

-- ============================================
-- 完成后验证：应该返回空数组（而不是报错）
-- SELECT * FROM users; -- 用 anon key 查不到数据是正常的（受 RLS 保护）
-- ============================================
