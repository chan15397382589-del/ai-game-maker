-- ============================================
-- AI 游戏创作课堂 - Supabase 数据库建表 SQL
-- 请在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

-- 1. 用户表（扩展 Supabase Auth 的用户信息）
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.users IS '用户信息表：存储学生和管理员的详细信息';
COMMENT ON COLUMN public.users.role IS '角色：student（学生）或 admin（管理员）';

-- 2. 对话记录表
CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.messages IS '对话记录表：存储学生与 AI 的对话历史';
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- 3. 游戏作品表
CREATE TABLE IF NOT EXISTS public.projects (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  game_title VARCHAR(200) NOT NULL,
  html_code TEXT NOT NULL,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.projects IS '游戏作品表：存储学生创作的游戏代码';
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_published ON public.projects(is_published);

-- ============================================
-- 启用行级安全策略 (RLS)
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 用户表策略
-- 学生可以读取自己的信息，管理员可以读取所有信息
CREATE POLICY "用户可以查看自己的信息" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "管理员可以查看所有用户信息" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "用户可以更新自己的信息" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- 对话记录策略
-- 学生只能访问自己的对话，管理员可以访问所有对话
CREATE POLICY "学生可以访问自己的对话" ON public.messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "管理员可以访问所有对话" ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 游戏作品策略
-- 学生可以管理自己的作品，已发布的作品所有人可见
CREATE POLICY "学生可以管理自己的作品" ON public.projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "所有人可以查看已发布的作品" ON public.projects
  FOR SELECT USING (is_published = TRUE);

-- ============================================
-- 创建自动更新 updated_at 的触发器函数
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 完成提示
-- ============================================
-- ✅ 数据库表创建完成！
-- ✅ 行级安全策略 (RLS) 配置完成！
-- 
-- 下一步：
-- 1. 在 Supabase Auth 中禁用 "Enable email confirmations"（设置 → Auth → Email）
-- 2. 创建第一个管理员账号后，手动在 SQL Editor 中执行：
--    UPDATE users SET role = 'admin' WHERE student_id = 'admin001';
-- ============================================
