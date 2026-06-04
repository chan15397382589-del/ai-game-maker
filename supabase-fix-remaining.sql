-- SRL实验设计：剩余步骤（前几步已执行成功，只需执行以下三句）

-- 第1句：清理重复记录（每个学生只保留id最大的那条）
DELETE FROM public.student_classifications a
USING public.student_classifications b
WHERE a.user_id = b.user_id
  AND a.test_type = b.test_type
  AND a.id < b.id;

-- 第2句：添加 user_id + test_type 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_user_testtype
  ON public.student_classifications(user_id, test_type);

-- 第3句：随机分配已有学生到两组
UPDATE public.users
SET srl_condition = CASE
  WHEN random() < 0.5 THEN 'srl_scaffold'
  ELSE 'control'
END
WHERE role = 'student'
  AND srl_condition IS NULL;
