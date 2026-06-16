-- 期末测试题库表
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id BIGSERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer VARCHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 学生答题记录表
CREATE TABLE IF NOT EXISTS public.exam_answers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  question_id BIGINT REFERENCES public.exam_questions(id) ON DELETE CASCADE NOT NULL,
  selected_answer VARCHAR(1) NOT NULL CHECK (selected_answer IN ('A', 'B', 'C', 'D')),
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_exam_answers_user ON public.exam_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_question ON public.exam_answers(question_id);

-- RLS
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

-- 管理员可以管理题目
CREATE POLICY "admin_manage_questions" ON public.exam_questions FOR ALL USING (true);

-- 学生只能插入和查看自己的答案
CREATE POLICY "student_insert_answers" ON public.exam_answers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "student_select_answers" ON public.exam_answers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin_select_answers" ON public.exam_answers FOR SELECT USING (true);
