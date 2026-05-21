-- ============================================
-- 学生分类评估 - 记录标准化前测结果
-- 请在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

CREATE TABLE IF NOT EXISTS public.student_classifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  q1_answers JSONB,
  q2_answer TEXT,
  q3_answer TEXT,
  q1_score INT DEFAULT 0,
  q2_score INT DEFAULT 0,
  q3_score INT DEFAULT 0,
  total_score INT DEFAULT 0,
  srl_group TEXT,
  total_time INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.student_classifications IS '学生分类评估：记录前测3题的选择结果、得分和分组';

CREATE INDEX IF NOT EXISTS idx_classifications_user_id ON public.student_classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_classifications_srl_group ON public.student_classifications(srl_group);

ALTER TABLE public.student_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "学生可以管理自己的分类" ON public.student_classifications
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "管理员可以访问所有分类" ON public.student_classifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
