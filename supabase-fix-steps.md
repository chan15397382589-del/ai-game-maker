# Supabase SQL 剩余执行步骤

前几步（ALTER TABLE新增列、CREATE INDEX）已执行成功，只需在Supabase SQL Editor中依次执行以下三句：

## 步骤1：清理重复记录

每个学生在student_classifications表中只保留id最大的那条记录。

```sql
DELETE FROM public.student_classifications a
USING public.student_classifications b
WHERE a.user_id = b.user_id
  AND a.test_type = b.test_type
  AND a.id < b.id;
```

## 步骤2：添加唯一约束

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_user_testtype
  ON public.student_classifications(user_id, test_type);
```

## 步骤3：随机分配学生到两组

```sql
UPDATE public.users
SET srl_condition = CASE
  WHEN random() < 0.5 THEN 'srl_scaffold'
  ELSE 'control'
END
WHERE role = 'student'
  AND srl_condition IS NULL;
```

## 验证

执行完后检查：

```sql
-- 确认没有重复记录
SELECT user_id, test_type, COUNT(*) FROM public.student_classifications GROUP BY user_id, test_type HAVING COUNT(*) > 1;

-- 确认分组情况
SELECT srl_condition, COUNT(*) FROM public.users WHERE role = 'student' GROUP BY srl_condition;
```
