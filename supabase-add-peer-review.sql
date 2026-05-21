-- ============================================
-- 同伴互评功能 - 数据库建表 SQL
-- 请在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

-- 1. 分享表：学生分享到互评区的作品
CREATE TABLE IF NOT EXISTS public.shared_items (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  game_title VARCHAR(200) NOT NULL,
  html_code TEXT NOT NULL,
  grade INT,
  class_num INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.shared_items IS '同伴互评分享表：存储学生主动分享的游戏作品';
CREATE INDEX IF NOT EXISTS idx_shared_items_grade_class ON public.shared_items(grade, class_num);
CREATE INDEX IF NOT EXISTS idx_shared_items_user_id ON public.shared_items(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_items_created_at ON public.shared_items(created_at DESC);

-- 2. 点赞表：一人一赞
CREATE TABLE IF NOT EXISTS public.likes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  shared_item_id BIGINT REFERENCES public.shared_items(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shared_item_id)
);

COMMENT ON TABLE public.likes IS '点赞记录表：每个学生对每个分享只能点赞一次';
CREATE INDEX IF NOT EXISTS idx_likes_shared_item_id ON public.likes(shared_item_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);

-- 3. 评论表
CREATE TABLE IF NOT EXISTS public.comments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  shared_item_id BIGINT REFERENCES public.shared_items(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.comments IS '评论表：学生对分享作品的评论';
CREATE INDEX IF NOT EXISTS idx_comments_shared_item_id ON public.comments(shared_item_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at ASC);

-- ============================================
-- 启用行级安全策略 (RLS)
-- ============================================

ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 分享表策略
CREATE POLICY "学生可以管理自己的分享" ON public.shared_items
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "所有人可以查看分享" ON public.shared_items
  FOR SELECT USING (true);

-- 点赞表策略
CREATE POLICY "学生可以管理自己的点赞" ON public.likes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "所有人可以查看点赞" ON public.likes
  FOR SELECT USING (true);

-- 评论表策略
CREATE POLICY "学生可以管理自己的评论" ON public.comments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "所有人可以查看评论" ON public.comments
  FOR SELECT USING (true);
