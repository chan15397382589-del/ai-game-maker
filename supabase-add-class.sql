-- ============================================
-- 新增：users 表添加 class_name 列
-- 用于分班级管理学生
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 添加班级名称列
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS class_name VARCHAR(100);

-- 2. 添加索引以支持按班级查询
CREATE INDEX IF NOT EXISTS idx_users_class_name 
ON public.users(class_name);

-- 3. 更新 RLS 策略（允许用户查看同班同学）
-- 如果不存在则创建
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' AND policyname = '管理员可以查看所有用户信息'
  ) THEN
    CREATE POLICY "管理员可以查看所有用户信息" ON public.users
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- 4. 验证
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'class_name';

-- ============================================
-- 完成
-- ============================================
