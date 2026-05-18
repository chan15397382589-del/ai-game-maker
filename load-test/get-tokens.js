/**
 * Token 获取辅助脚本
 * 自动登录测试学生账号获取 auth token
 *
 * 用法: node load-test/get-tokens.js
 *
 * 前提条件：至少有一个测试学生账号已在 Supabase 中注册
 */

const BASE_URL = "http://localhost:3000";

// 配置测试学生（需要先在 Supabase 中注册好）
const TEST_STUDENTS = [
  { id: "2024001", password: "123456" },
  { id: "2024002", password: "123456" },
  { id: "2024003", password: "123456" },
];

async function loginStudent(studentId, password) {
  try {
    const email = `${studentId}@ai-game.student`;
    // 直接调用 Supabase Auth API（绕过 Next.js）
    const supabaseUrl = "https://fyocfhjjiazjgdxdaxur.supabase.co";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json();
      return { studentId, token: data.access_token, refreshToken: data.refresh_token, ok: true };
    } else {
      const err = await res.json();
      return { studentId, ok: false, error: err.error_description || err.msg || JSON.stringify(err) };
    }
  } catch (err) {
    return { studentId, ok: false, error: err.message };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  获取测试 Token");
  console.log("═══════════════════════════════════════════\n");

  const results = [];
  for (const student of TEST_STUDENTS) {
    console.log(`登录 ${student.id}...`);
    const result = await loginStudent(student.id, student.password);
    results.push(result);
    if (result.ok) {
      console.log(`  ✅ Token: ${result.token.substring(0, 30)}...`);
    } else {
      console.log(`  ❌ 失败: ${result.error}`);
    }
  }

  const validTokens = results.filter((r) => r.ok).map((r) => r.token);

  console.log(`\n───────────────────────────────────────────`);
  console.log(`  获取到 ${validTokens.length}/${TEST_STUDENTS.length} 个有效 token`);
  console.log(`───────────────────────────────────────────\n`);

  if (validTokens.length > 0) {
    console.log("// 复制以下代码到 deepseek-concurrency.js 的 TEST_TOKENS 数组:\n");
    console.log("const TEST_TOKENS = [");
    validTokens.forEach((t) => console.log(`  "${t}",`));
    console.log("];\n");
  } else {
    console.log("没有获取到有效 token。");
    console.log("请先在管理后台创建测试学生账号，或手动配置 TOKEN。\n");
    console.log("手动获取方法：");
    console.log("1. 浏览器打开 http://localhost:3000/login");
    console.log("2. 登录学生账号");
    console.log("3. F12 → Application → Local Storage");
    console.log("4. 找到 sb-xxx-auth-token，复制值到 deepseek-concurrency.js\n");
  }
}

main().catch(console.error);
