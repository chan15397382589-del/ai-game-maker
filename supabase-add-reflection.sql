-- 反思功能数据库迁移
-- 为 conversations 和 projects 表增加 reflection 字段

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reflection TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reflection TEXT;

-- reflection 字段存储 JSON 字符串，格式示例：
-- {
--   "card1": "我的游戏是打地鼠，地鼠从6个洞里随机冒出来，玩家要在限定时间内打中尽可能多的地鼠",
--   "card2": "我决定用地鼠冒出时间越来越短来增加难度",
--   "card3": "下次我想加一个boss地鼠，打中它能加10分"
-- }
