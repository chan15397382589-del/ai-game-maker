# AI Game Classroom - Web App

## 运行步骤

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
编辑 `.env.local` 文件，填入正确的值：
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase 公开密钥
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase 服务密钥
- `ANTHROPIC_BASE_URL` - MIMO API 端点
- `ANTHROPIC_AUTH_TOKEN` - MIMO API 密钥

### 3. 运行开发服务器
```bash
npm run dev
```

### 4. 访问网站
打开浏览器访问 http://localhost:3000

## 测试账号
- 学生：学号 1001，密码 123456
- 管理员：账号 admin，密码 123456

## 功能
- 游戏构思（基础调查 + 个人设计）
- 游戏设计（与小智老师对话）
- 作品展示（同学作品墙）
- 我的反思（三张反思卡片）
