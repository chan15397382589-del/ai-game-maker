-- 学生先前知识前测表（安全版，可重复执行）

-- 创建表（如不存在）
CREATE TABLE IF NOT EXISTS public.student_prior_knowledge (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  q1_gaming TEXT,
  q2_programming TEXT,
  q3_favorite TEXT,
  skipped BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 补加列（如已存在则跳过）
ALTER TABLE public.student_prior_knowledge ADD COLUMN IF NOT EXISTS q3_favorite TEXT;

-- 启用 RLS
ALTER TABLE public.student_prior_knowledge ENABLE ROW LEVEL SECURITY;

-- 删除旧策略后重建
DROP POLICY IF EXISTS "Students can manage own prior knowledge" ON public.student_prior_knowledge;
CREATE POLICY "Students can manage own prior knowledge"
  ON public.student_prior_knowledge FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all prior knowledge" ON public.student_prior_knowledge;
CREATE POLICY "Admins can view all prior knowledge"
  ON public.student_prior_knowledge FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- 索引
CREATE INDEX IF NOT EXISTS idx_prior_knowledge_user ON public.student_prior_knowledge(user_id);
