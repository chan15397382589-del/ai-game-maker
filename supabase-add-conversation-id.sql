-- 给 shared_items 表添加 conversation_id 列（用于关联对话记录）
ALTER TABLE public.shared_items ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_shared_items_conversation_id ON public.shared_items(conversation_id);
