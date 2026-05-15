-- ============================================
-- 学生管理模块升级：添加年级/班级字段
-- 在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

-- 1. 添加新字段到 users 表（仅对 role='student' 的记录有意义）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS grade INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS class_num INTEGER;

COMMENT ON COLUMN public.users.gender IS '性别：男/女';
COMMENT ON COLUMN public.users.grade IS '年级：3=三年级, 4=四年级, 5=五年级, 6=六年级';
COMMENT ON COLUMN public.users.class_num IS '班级：1-10';

-- 2. 添加索引：按年级+班级查询
CREATE INDEX IF NOT EXISTS idx_users_grade_class ON public.users(grade, class_num)
  WHERE role = 'student';

-- 3. 迁移旧的 class_name 数据（如有）
-- 例如 "三年级8班" → grade=3, class_num=8
-- "四年级1班" → grade=4, class_num=1
UPDATE public.users
SET
  grade = CASE
    WHEN class_name LIKE '三%' THEN 3
    WHEN class_name LIKE '四%' THEN 4
    WHEN class_name LIKE '五%' THEN 5
    WHEN class_name LIKE '六%' THEN 6
    ELSE NULL
  END,
  class_num = CASE
    WHEN class_name ~ '[0-9]+' THEN CAST(regexp_replace(class_name, '[^0-9]', '', 'g') AS INTEGER)
    ELSE NULL
  END
WHERE role = 'student' AND class_name IS NOT NULL AND grade IS NULL;

-- 4. 可选：删除旧的 class_name 列（确认迁移无误后取消注释）
-- ALTER TABLE public.users DROP COLUMN IF EXISTS class_name;

-- ============================================
-- 完成提示
-- ============================================
-- grade 对应关系：
--   3 = 三年级
--   4 = 四年级
--   5 = 五年级
--   6 = 六年级
-- class_num 范围：1-10
-- ============================================
