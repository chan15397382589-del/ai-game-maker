-- ============================================
-- 新增：conversations 对话文档表
-- 每位学生最多2个对话文档，每个文档独立管理游戏代码和消息
-- 在 Supabase 后台 → SQL Editor 中执行此脚本
-- ============================================

-- 1. 创建对话文档表
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '新对话',
  html_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.conversations IS '对话文档表：每位学生最多2个文档，每个文档独立管理对话和游戏';

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);

-- 3. 启用行级安全策略 (RLS)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 学生可以管理自己的对话文档
CREATE POLICY "学生可以管理自己的对话文档" ON public.conversations
  FOR ALL USING (auth.uid() = user_id);

-- 管理员可以查看所有对话文档
CREATE POLICY "管理员可以查看所有对话文档" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. 更新触发器
CREATE OR REPLACE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. 从现有消息回填对话文档（可选：将已有 session_id 的消息归入对话）
-- 只处理 session_id 不为空的旧消息
INSERT INTO public.conversations (id, user_id, title, html_code, created_at, updated_at)
SELECT
  sub.session_id,
  sub.user_id,
  sub.first_msg,
  NULL,
  sub.first_time,
  sub.last_time
FROM (
  SELECT
    m.session_id,
    m.user_id,
    MIN(m.created_at) as first_time,
    MAX(m.created_at) as last_time,
    COALESCE(
      (SELECT content FROM public.messages m2
       WHERE m2.session_id = m.session_id AND m2.user_id = m.user_id AND m2.role = 'user'
       ORDER BY m2.created_at LIMIT 1),
      '旧对话'
    ) as first_msg
  FROM public.messages m
  WHERE m.session_id IS NOT NULL
  GROUP BY m.session_id, m.user_id
) sub
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 完成提示
-- ============================================
-- ✅ conversations 表已创建
-- ✅ RLS 策略已配置
-- ✅ 更新触发器已设置
-- ✅ 旧数据已回填
--
-- 下一步：重启开发服务器即可使用
-- ============================================
