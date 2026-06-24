-- 修复 shared_item_id 列类型：BIGINT → TEXT（支持 UUID 和整数）
ALTER TABLE public.peer_reviews ALTER COLUMN shared_item_id TYPE TEXT USING shared_item_id::TEXT;

-- 移除旧的外键约束（如果存在）
ALTER TABLE public.peer_reviews DROP CONSTRAINT IF EXISTS peer_reviews_shared_item_id_fkey;
