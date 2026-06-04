-- ============================================
-- 完整数据库设置脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100),
  student_id VARCHAR(50) UNIQUE,
  role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  gender VARCHAR(10),
  grade INT,
  class_num INT,
  srl_condition VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 消息表
CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  session_id UUID,
  input_method VARCHAR(20),
  has_code BOOLEAN DEFAULT false,
  ai_suggestion_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 对话表
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '新对话',
  html_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 游戏快照表
CREATE TABLE IF NOT EXISTS public.game_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  html_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 学生任务表
CREATE TABLE IF NOT EXISTS public.student_tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  task_id VARCHAR(20) NOT NULL,
  design_image TEXT,
  game_rules JSONB DEFAULT '[]',
  game_name VARCHAR(200),
  design_reason TEXT,
  discussion_notes TEXT,
  duration_seconds INT DEFAULT 0,
  save_count INT DEFAULT 0,
  undo_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 小组消息表
CREATE TABLE IF NOT EXISTS public.group_messages (
  id BIGSERIAL PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  voice_url TEXT,
  voice_transcript TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 索引
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_game_snapshots_user_id ON public.game_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_user_id ON public.student_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_task_id ON public.student_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);

-- 8. 启用 RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- 9. 删除旧策略（如果存在）
DROP POLICY IF EXISTS "用户可以查看自己的信息" ON public.users;
DROP POLICY IF EXISTS "管理员可以查看所有用户" ON public.users;
DROP POLICY IF EXISTS "用户可以管理自己的消息" ON public.messages;
DROP POLICY IF EXISTS "管理员可以查看所有消息" ON public.messages;
DROP POLICY IF EXISTS "用户可以管理自己的对话" ON public.conversations;
DROP POLICY IF EXISTS "管理员可以查看所有对话" ON public.conversations;
DROP POLICY IF EXISTS "用户可以访问自己的游戏快照" ON public.game_snapshots;
DROP POLICY IF EXISTS "管理员可以访问所有游戏快照" ON public.game_snapshots;
DROP POLICY IF EXISTS "用户可以管理自己的任务" ON public.student_tasks;
DROP POLICY IF EXISTS "管理员可以查看所有任务" ON public.student_tasks;
DROP POLICY IF EXISTS "用户可以发送小组消息" ON public.group_messages;
DROP POLICY IF EXISTS "用户可以查看小组消息" ON public.group_messages;

-- 10. 创建 RLS 策略
-- 用户表
CREATE POLICY "用户可以查看自己的信息" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "管理员可以查看所有用户" ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 消息表
CREATE POLICY "用户可以管理自己的消息" ON public.messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "管理员可以查看所有消息" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 对话表
CREATE POLICY "用户可以管理自己的对话" ON public.conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "管理员可以查看所有对话" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 游戏快照表
CREATE POLICY "用户可以访问自己的游戏快照" ON public.game_snapshots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "管理员可以访问所有游戏快照" ON public.game_snapshots FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 学生任务表
CREATE POLICY "用户可以管理自己的任务" ON public.student_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "管理员可以查看所有任务" ON public.student_tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 小组消息表
CREATE POLICY "用户可以发送小组消息" ON public.group_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "用户可以查看小组消息" ON public.group_messages FOR SELECT USING (true);

-- 11. 更新触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 12. 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
DROP TRIGGER IF EXISTS update_student_tasks_updated_at ON public.student_tasks;

-- 13. 创建触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_tasks_updated_at BEFORE UPDATE ON public.student_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 完成
SELECT 'Database setup complete!' as status;
