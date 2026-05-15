-- ============================================
-- 修复：新用户注册时无法写入 users 表的问题
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 允许已登录用户插入自己的记录（注册时使用）
CREATE POLICY "用户可以插入自己的记录"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. 创建触发器函数：当 auth.users 新增用户时，自动在 public.users 插入记录
-- （这样注册时就不需要手动插入 public.users 了）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, student_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', '新用户'),
    COALESCE(NEW.raw_user_meta_data->>'student_id', NEW.id::text),
    'student'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 创建触发器（如果还不存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 说明：
-- 方案 A（推荐）：使用上面的触发器，注册时只需 auth.signUp，
-- Supabase 会自动在 public.users 建记录
-- 
-- 方案 B：如果触发器不生效，也可以放宽 RLS 策略：
--   CREATE POLICY "允许注册时插入" ON public.users
--     FOR INSERT WITH CHECK (true);
-- ============================================
