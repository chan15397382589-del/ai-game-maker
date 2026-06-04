-- 任务系统数据表
-- 设计图、游戏规则、小组讨论记录

-- 1. 学生任务数据表
CREATE TABLE IF NOT EXISTS public.student_tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  task_id VARCHAR(10) NOT NULL, -- '1-1', '1-2', '2-1', '2-2', '3-1', '3-2'
  design_image TEXT, -- 设计图PNG（base64）
  game_rules JSONB DEFAULT '[]', -- 游戏规则数组
  game_name VARCHAR(200), -- 游戏名称
  design_reason TEXT, -- 设计理由
  discussion_notes TEXT, -- 讨论记录
  revision_notes JSONB DEFAULT '[]', -- 修改记录数组
  duration_seconds INT DEFAULT 0, -- 任务时长
  save_count INT DEFAULT 0, -- 保存次数
  undo_count INT DEFAULT 0, -- 撤销次数
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, task_id)
);

COMMENT ON TABLE public.student_tasks IS '学生任务数据：设计图、规则、讨论记录等';
CREATE INDEX IF NOT EXISTS idx_student_tasks_user_id ON public.student_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_task_id ON public.student_tasks(task_id);

-- 2. 小组聊天消息表
CREATE TABLE IF NOT EXISTS public.group_messages (
  id BIGSERIAL PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL, -- 小组ID
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL, -- 消息内容
  message_type VARCHAR(20) DEFAULT 'text', -- 'text' 或 'voice'
  voice_url TEXT, -- 语音文件URL（如果是语音消息）
  voice_transcript TEXT, -- 语音转文字内容
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.group_messages IS '小组聊天消息：文字+语音';
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_user_id ON public.group_messages(user_id);

-- 3. 小组信息表
CREATE TABLE IF NOT EXISTS public.groups (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade INT,
  class_num INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.groups IS '小组信息';

-- 4. 小组成员表
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id VARCHAR(50) REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

COMMENT ON TABLE public.group_members IS '小组成员关系';

-- RLS策略
ALTER TABLE public.student_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "学生可以管理自己的任务数据" ON public.student_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "所有人可以查看任务数据" ON public.student_tasks FOR SELECT USING (true);

CREATE POLICY "学生可以发送小组消息" ON public.group_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "所有人可以查看小组消息" ON public.group_messages FOR SELECT USING (true);

CREATE POLICY "所有人可以查看小组信息" ON public.groups FOR SELECT USING (true);
CREATE POLICY "所有人可以查看小组成员" ON public.group_members FOR SELECT USING (true);
