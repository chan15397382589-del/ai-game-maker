-- ============================================
-- AI 游戏创作课堂 - 修复触发器
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 创建或替换触发器函数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, student_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', '新用户'),
    COALESCE(NEW.raw_user_meta_data->>'student_id', NEW.id::text),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;  -- 如果已存在则跳过
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. 创建新触发器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. 验证触发器是否创建成功
SELECT 
  trigger_name, 
  event_manipulation, 
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- 5. 检查现有用户是否缺少 users 表记录
-- 执行此查询查看哪些 Auth 用户在 users 表中没有记录
SELECT 
  au.id as auth_user_id,
  au.email,
  au.raw_user_meta_data,
  u.id as users_table_id,
  u.role
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL;

-- 6. 手动修复：为缺少记录的用户插入数据（如果需要）
-- 取消注释以下代码并执行：
/*
INSERT INTO public.users (id, name, student_id, role)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'name', '新用户'),
  COALESCE(au.raw_user_meta_data->>'student_id', au.id::text),
  'student'
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL
ON CONFLICT (id) DO NOTHING;
*/

-- ============================================
-- 完成提示
-- ============================================
-- ✅ 触发器创建完成！
-- ✅ 新注册的用户将自动在 public.users 表中创建记录
-- ✅ 执行此脚本后，请在 Supabase Auth 中注册新用户测试
-- 
-- 如需修复现有用户，请取消注释第 6 步的代码并执行
-- ============================================
