-- ============================================
-- 管理员账号诊断与修复脚本
-- 在 Supabase 后台 → SQL Editor 中执行
-- ============================================

-- 第 1 步：查看 users 表当前状态
SELECT id, name, email, role, student_id, created_at FROM public.users;

-- 第 2 步：查看 auth.users 中所有用户（只显示基本信息）
SELECT id, email, raw_user_meta_data, created_at FROM auth.users ORDER BY created_at;

-- ============================================
-- ⚠️ 如果上面的查询显示 users 表为空或没有管理员，
-- 请手动执行下面的语句（替换成你的真实邮箱）：
--
-- INSERT INTO public.users (id, name, email, role)
-- SELECT 
--   id,
--   COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1), '管理员'),
--   email,
--   'admin'
-- FROM auth.users
-- WHERE email = '你的管理员邮箱@example.com'  -- ← 改成你的真实邮箱
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';
--
-- ============================================

-- 第 3 步：验证 RLS 函数和策略状态
SELECT proname FROM pg_proc WHERE proname = 'is_admin';

SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
