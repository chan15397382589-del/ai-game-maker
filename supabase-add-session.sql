-- ============================================
-- 新增：messages 表添加 session_id 列
-- 用于支持对话会话分组管理
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 添加 session_id 列（UUID 类型，可为空）
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS session_id UUID;

-- 2. 创建索引加速按会话查询
CREATE INDEX IF NOT EXISTS idx_messages_session 
ON public.messages(user_id, session_id);

-- 3. 为已有的旧消息生成 session_id（每个独立的消息归为一个最小会话）
-- 如果 session_id 为空，为其设置一个默认 UUID，方便分组展示
UPDATE public.messages 
SET session_id = gen_random_uuid() 
WHERE session_id IS NULL;

-- 4. 验证
SELECT 
  session_id,
  COUNT(*) as message_count,
  MIN(created_at) as first_message,
  MAX(created_at) as last_message
FROM public.messages 
GROUP BY session_id
ORDER BY MAX(created_at) DESC;

-- ============================================
-- 完成提示
-- ============================================
-- ✅ session_id 列已添加
-- ✅ 索引已创建
-- ✅ 旧消息已分配默认 session_id
-- 
-- 下一步：重启开发服务器，对话将按会话分组展示
-- ============================================
