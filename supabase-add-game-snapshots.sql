-- ============================================
-- 游戏版本快照 - 记录每次生成的游戏代码
-- 请在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

CREATE TABLE IF NOT EXISTS public.game_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  html_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.game_snapshots IS '游戏代码快照：记录每次 AI 生成/修改游戏时的完整代码';

CREATE INDEX IF NOT EXISTS idx_game_snapshots_user_id ON public.game_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_game_snapshots_conv_id ON public.game_snapshots(conversation_id);
CREATE INDEX IF NOT EXISTS idx_game_snapshots_created_at ON public.game_snapshots(created_at DESC);

ALTER TABLE public.game_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "学生可以访问自己的游戏快照" ON public.game_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "管理员可以访问所有游戏快照" ON public.game_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
