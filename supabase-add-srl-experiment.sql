-- SRL实验设计：新增字段（安全版，可重复执行）

-- 1) users表新增 srl_condition 列（随机分组）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS srl_condition TEXT DEFAULT NULL;
-- 可选值: 'srl_scaffold' / 'control'

-- 2) student_classifications 新增 test_type 列（区分前测/后测）
ALTER TABLE public.student_classifications ADD COLUMN IF NOT EXISTS test_type TEXT DEFAULT 'pre';
-- 可选值: 'pre' / 'post'

-- 3) messages 新增 ai_suggestion_type 列（AI回复类型自动分类）
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ai_suggestion_type TEXT DEFAULT NULL;
-- 可选值: 'options' / 'generate' / 'question' / 'debug_guide' / 'feedback' / 'confirm'

-- 3) 为新列建立索引
CREATE INDEX IF NOT EXISTS idx_users_srl_condition ON public.users(srl_condition);
CREATE INDEX IF NOT EXISTS idx_classifications_test_type ON public.student_classifications(test_type);

-- 4) 清理重复记录：每个学生只保留最新的 pre 记录
DELETE FROM public.student_classifications a
USING public.student_classifications b
WHERE a.user_id = b.user_id
  AND a.test_type = b.test_type
  AND a.id < b.id;

-- 5) 删除旧的唯一约束（如果存在），添加 user_id + test_type 的唯一约束
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_classifications_user_id_key'
    AND table_name = 'student_classifications'
  ) THEN
    ALTER TABLE public.student_classifications
      DROP CONSTRAINT student_classifications_user_id_key;
  END IF;
END $$;

-- 添加 user_id + test_type 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_user_testtype
  ON public.student_classifications(user_id, test_type);

-- 6) 随机分配已有学生到两组（只执行一次）

-- 5) 随机分配已有学生到两组（只执行一次）
UPDATE public.users
SET srl_condition = CASE
  WHEN random() < 0.5 THEN 'srl_scaffold'
  ELSE 'control'
END
WHERE role = 'student'
  AND srl_condition IS NULL;
