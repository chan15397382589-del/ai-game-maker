import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--apply") {
  throw new Error("用法：设置 CAT_INITIAL_PASSWORD 后执行 node scripts/create-cat-numbered-reviewers.mjs --apply");
}

const password = process.env.CAT_INITIAL_PASSWORD;
if (!password || password.length < 6) throw new Error("缺少至少 6 位的初始密码");

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
  .filter(Boolean)
  .map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const loginClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function check(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

const { data: admins, error: adminsError } = await db.from("users").select("id").eq("role", "admin");
check(adminsError, "读取管理员");
if (admins?.length !== 1) throw new Error(`预期恰有一名管理员，实际 ${admins?.length ?? 0} 名`);

const { data: reviewers, error: reviewersError } = await db.from("cat_reviewers")
  .select("id,reviewer_code,auth_user_id").in("reviewer_code", ["R01", "R02", "R03", "R04", "R05"]);
check(reviewersError, "读取评审登记");
const byCode = new Map(reviewers?.map((row) => [row.reviewer_code, row]) || []);

const { data: authPage, error: authError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
check(authError, "读取 Auth 用户");
if (authPage.nextPage) throw new Error("Auth 用户超过一页，须先完成全量查重");
const byEmail = new Map(authPage.users.map((user) => [user.email?.toLowerCase(), user]));

for (let number = 1; number <= 5; number++) {
  const code = `R0${number}`;
  const email = `cat-reviewer-${number}@vibeclassroom.invalid`;
  const existing = byCode.get(code);
  const existingAuth = byEmail.get(email);
  if (existing || existingAuth) {
    if (existing && existingAuth?.id === existing.auth_user_id) {
      console.log(`EXISTS\t${number}\t${code}`);
      continue;
    }
    throw new Error(`${code} 的 Auth 用户与评审登记不一致；停止创建，须先人工核查`);
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_kind: "cat_reviewer" },
  });
  check(createError, `创建 ${code} Auth 用户`);
  if (!created.user) throw new Error(`${code} Auth 创建没有返回用户`);

  const userId = created.user.id;
  try {
    // 旧版 Auth 触发器可能将新专家误写成学生；仅清理本次新建账号的占位行。
    const { data: platformUser, error: platformError } = await db.from("users")
      .select("id,role,student_id").eq("id", userId).maybeSingle();
    check(platformError, `检查 ${code} 平台用户`);
    if (platformUser) {
      if (platformUser.role !== "student") {
        throw new Error(`${code} 与非学生平台账号冲突（role=${platformUser.role}）`);
      }
      const { error: cleanupError } = await db.from("users").delete()
        .eq("id", userId).eq("role", "student");
      check(cleanupError, `清理 ${code} 占位学生行`);
    }

    const { data: row, error: insertError } = await db.from("cat_reviewers")
      .insert({ auth_user_id: userId, expert_name: null, reviewer_code: code, created_by: admins[0].id })
      .select("id,reviewer_code,auth_user_id").single();
    check(insertError, `登记 ${code}`);
    if (!row || row.auth_user_id !== userId) throw new Error(`${code} 登记后回读不一致`);
    console.log(`CREATED\t${number}\t${code}`);
  } catch (error) {
    const { error: rollbackError } = await db.auth.admin.deleteUser(userId);
    if (rollbackError) throw new Error(`${error.message}；Auth 回滚亦失败：${rollbackError.message}`);
    throw error;
  }
}

const { data: finalRows, error: finalError } = await db.from("cat_reviewers")
  .select("reviewer_code,auth_user_id,expert_name").in("reviewer_code", ["R01", "R02", "R03", "R04", "R05"]);
check(finalError, "最终回读");
if (finalRows?.length !== 5 || finalRows.some((row) => row.expert_name !== null)) {
  throw new Error("最终评审账号数量或实名状态不符");
}
for (const row of finalRows) {
  const { data, error } = await db.auth.admin.getUserById(row.auth_user_id);
  check(error, `核验 ${row.reviewer_code} Auth`);
  if (!data.user) throw new Error(`${row.reviewer_code} Auth 用户缺失`);
  const { data: platformUser, error: platformError } = await db.from("users")
    .select("id").eq("id", row.auth_user_id).maybeSingle();
  check(platformError, `核验 ${row.reviewer_code} 身份隔离`);
  if (platformUser) throw new Error(`${row.reviewer_code} 仍被登记为学生或管理员`);
  const number = Number(row.reviewer_code.slice(2));
  const { data: session, error: loginError } = await loginClient.auth.signInWithPassword({
    email: `cat-reviewer-${number}@vibeclassroom.invalid`, password,
  });
  check(loginError, `核验 ${row.reviewer_code} 实际登录`);
  if (session.user?.id !== row.auth_user_id) throw new Error(`${row.reviewer_code} 登录身份不符`);
  await loginClient.auth.signOut();
}
console.log("VERIFIED\t5 numbered reviewer accounts and password logins");
