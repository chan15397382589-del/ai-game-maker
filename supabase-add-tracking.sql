-- 研究数据采集：事件追踪表（安全版，可重复执行）

-- 1) 交互事件表（undo/redo、视图切换、代码查看等）
CREATE TABLE IF NOT EXISTS public.interaction_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) 游戏事件表（iframe postMessage 回传的游戏内事件）
CREATE TABLE IF NOT EXISTS public.game_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3) messages 表新增列
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS input_method TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS has_code BOOLEAN DEFAULT false;

-- 索引
CREATE INDEX IF NOT EXISTS idx_interaction_events_user ON public.interaction_events(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_events_session ON public.interaction_events(session_id);
CREATE INDEX IF NOT EXISTS idx_interaction_events_type ON public.interaction_events(event_type);
CREATE INDEX IF NOT EXISTS idx_game_events_user ON public.game_events(user_id);
CREATE INDEX IF NOT EXISTS idx_game_events_session ON public.game_events(session_id);
CREATE INDEX IF NOT EXISTS idx_game_events_type ON public.game_events(event_type);

-- RLS
ALTER TABLE public.interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

-- 学生：只能插入自己的事件
DROP POLICY IF EXISTS "Students can insert own interaction events" ON public.interaction_events;
CREATE POLICY "Students can insert own interaction events"
  ON public.interaction_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students can insert own game events" ON public.game_events;
CREATE POLICY "Students can insert own game events"
  ON public.game_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 管理员：可查看所有事件
DROP POLICY IF EXISTS "Admins can view all interaction events" ON public.interaction_events;
CREATE POLICY "Admins can view all interaction events"
  ON public.interaction_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view all game events" ON public.game_events;
CREATE POLICY "Admins can view all game events"
  ON public.game_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );
