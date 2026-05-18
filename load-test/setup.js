/**
 * DeepSeek 压测一键配置脚本
 * 自动查找/创建测试学生 + 获取 token + 写入压测脚本
 *
 * 用法: node load-test/setup.js
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// 从 .env.local 读取配置（需要先安装 dotenv: npm install dotenv 或已有）
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") }); } catch {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("❌ 缺少环境变量！请复制 .env.local.example 为 .env.local 并填入真实值。");
  console.error("   或者手动设置：");
  console.error("   set NEXT_PUBLIC_SUPABASE_URL=你的URL");
  console.error("   set NEXT_PUBLIC_SUPABASE_ANON_KEY=你的ANON_KEY");
  console.error("   set SUPABASE_SERVICE_ROLE_KEY=你的SERVICE_KEY");
  process.exit(1);
}

const BASE_URL = "http://localhost:3000";
const TARGET_COUNT = 5; // 需要多少个测试学生

// Supabase 客户端
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 获取已有学生列表
async function getExistingStudents() {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/students`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) {
      // 用 service key 直接查数据库
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .eq("role", "student")
        .limit(20);
      if (error) throw error;
      return data || [];
    }
    return (await res.json()) || [];
  } catch (err) {
    console.log("  API 查询失败，改用 Supabase 直连...");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name, student_id")
      .eq("role", "student")
      .limit(20);
    if (error) { console.error("数据库查询失败:", error.message); return []; }
    return data || [];
  }
}

// 创建测试学生账号
async function createTestStudent(num) {
  const studentId = `test${String(num).padStart(3, "0")}`;
  const email = `${studentId}@ai-game.student`;
  const password = "123456";

  try {
    // 检查是否已存在
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("student_id", studentId)
      .single();

    if (existing) {
      console.log(`  ${studentId} 已存在，跳过创建`);
      return { studentId, password, userId: existing.id, created: false };
    }

    // 用 service role 创建 auth 用户（免频率限制）
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "student" },
    });

    if (authError) {
      if (authError.message.includes("already")) {
        console.log(`  ${studentId} auth 已存在（继续）`);
        return { studentId, password, created: false };
      }
      console.log(`  ${studentId} 创建 auth 失败: ${authError.message}`);
      return null;
    }

    // 在 users 表中创建记录
    const userId = authData.user.id;
    const { error: dbError } = await supabaseAdmin.from("users").insert({
      id: userId,
      name: `测试学生${num}`,
      student_id: studentId,
      role: "student",
      gender: num % 2 === 0 ? "男" : "女",
      grade: 4,
      class_num: num,
    });

    if (dbError) {
      console.log(`  ${studentId} 创建 users 记录失败: ${dbError.message}`);
      return null;
    }

    console.log(`  ✅ 创建 ${studentId} (${email})`);
    return { studentId, password, userId, created: true };
  } catch (err) {
    console.log(`  ${studentId} 异常: ${err.message}`);
    return null;
  }
}

// 重置学生密码为 123456（使用 service role key）
async function resetPassword(studentId) {
  try {
    // 先查 auth.users 拿到 uid
    const { data: students } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("student_id", studentId)
      .single();

    if (!students?.id) return false;

    // 用 service key 直接改密码
    const { error } = await supabaseAdmin.auth.admin.updateUserById(students.id, {
      password: "123456",
    });

    return !error;
  } catch {
    return false;
  }
}

// 登录获取 token
async function loginStudent(studentId, password) {
  try {
    const email = `${studentId}@ai-game.student`;
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });

    if (error) {
      // 密码不对，尝试重置
      if (error.message.includes("Invalid") || error.message.includes("invalid")) {
        console.log(`    密码错误，正在重置 ${studentId} 密码...`);
        const resetOk = await resetPassword(studentId);
        if (resetOk) {
          // 重试登录
          const { data: retryData, error: retryError } = await supabaseAnon.auth.signInWithPassword({ email, password });
          if (retryError) {
            return { studentId, ok: false, error: `重置密码后登录也失败: ${retryError.message}` };
          }
          return { studentId, ok: true, token: retryData.session.access_token };
        }
      }
      return { studentId, ok: false, error: error.message };
    }

    return { studentId, ok: true, token: data.session.access_token };
  } catch (err) {
    return { studentId, ok: false, error: err.message };
  }
}

// 将 token 写入压测脚本
function updateTestScript(tokens) {
  const scriptPath = path.join(__dirname, "deepseek-concurrency.js");
  let content = fs.readFileSync(scriptPath, "utf-8");

  const tokenLines = tokens.map((t) => `  "${t}",`).join("\n");
  const replacement = `const TEST_TOKENS = [\n${tokenLines}\n];`;

  content = content.replace(/const TEST_TOKENS = \[[\s\S]*?\];/, replacement);
  fs.writeFileSync(scriptPath, content);
  console.log(`\n  ✅ 已将 ${tokens.length} 个 token 写入 deepseek-concurrency.js`);
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  DeepSeek 压测一键配置");
  console.log("═══════════════════════════════════════════\n");

  // Step 1: 查找已有学生
  console.log("[1/3] 查找已有学生账号...");
  const existing = await getExistingStudents();
  console.log(`  找到 ${existing.length} 个学生\n`);

  // Step 2: 不够则创建测试学生
  let testStudents = [];
  if (existing.length >= TARGET_COUNT) {
    testStudents = existing.slice(0, TARGET_COUNT).map((s) => ({
      studentId: s.student_id,
      password: "123456",
    }));
    console.log(`[2/3] 使用已有学生 (${testStudents.map((s) => s.studentId).join(", ")})`);
  } else {
    console.log(`[2/3] 学生不足，创建测试账号...`);
    const need = TARGET_COUNT - existing.length;
    for (let i = existing.length + 1; i <= existing.length + need; i++) {
      const result = await createTestStudent(i);
      if (result) testStudents.push({ studentId: result.studentId, password: result.password });
      await sleep(200); // 避免创建太快
    }
  }
  console.log(`  共 ${testStudents.length} 个测试学生\n`);

  // Step 3: 登录获取 token
  console.log("[3/3] 登录获取 auth token...");
  const tokens = [];
  for (const s of testStudents) {
    const result = await loginStudent(s.studentId, s.password);
    if (result.ok) {
      tokens.push(result.token);
      console.log(`  ✅ ${s.studentId} → ${result.token.substring(0, 30)}...`);
    } else {
      console.log(`  ❌ ${s.studentId} → ${result.error}`);
    }
    await sleep(500); // 避免登录频率限制
  }

  console.log(`\n  获取到 ${tokens.length}/${testStudents.length} 个有效 token`);

  if (tokens.length > 0) {
    // 写入压测脚本
    updateTestScript(tokens);

    console.log("\n═══════════════════════════════════════════");
    console.log("  配置完成！现在可以运行：");
    console.log("═══════════════════════════════════════════\n");
    console.log("  node load-test/deepseek-concurrency.js 3    # 3并发测试");
    console.log("  node load-test/deepseek-concurrency.js 10   # 10并发测试");
    console.log("  node load-test/deepseek-concurrency.js 20   # 20并发测试\n");
  } else {
    console.log("\n  ❌ 未能获取 token，请检查网络和账号配置");
  }
}

main().catch((e) => {
  console.error("配置异常:", e);
  process.exit(1);
});
