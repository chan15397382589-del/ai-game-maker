import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { getDB } from "@/lib/supabase-admin";


// ==================== GET: 学生列表（支持年级/班级筛选 + 搜索） ====================
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade");       // "3" | "4" | "5" | "6"
    const classNum = searchParams.get("class_num"); // "1"-"10"
    const keyword = searchParams.get("keyword")?.trim(); // 姓名/学号搜索

    const db = getDB();
    let query = db
      .from("users")
      .select("*")
      .eq("role", "student");

    // 年级筛选
    if (grade) {
      query = query.eq("grade", parseInt(grade));
    }
    // 班级筛选
    if (classNum) {
      query = query.eq("class_num", parseInt(classNum));
    }
    // 关键词搜索（姓名或学号模糊匹配）
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,student_id.ilike.%${keyword}%`);
    }

    query = query.order("grade", { ascending: true })
               .order("class_num", { ascending: true })
               .order("student_id", { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[学生列表] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== POST: 批量导入学生（预校验+确认导入两步合一） ====================
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const body = await req.json();
    const { students, grade } = body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "无学生数据" }, { status: 400 });
    }

    const g = parseInt(grade);
    if (isNaN(g) || g < 3 || g > 6) {
      return NextResponse.json({ error: "年级无效（3-6）" }, { status: 400 });
    }

    const db = getDB();
    const results: { name: string; student_id: string; status: string; error?: string }[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const name = (s.name || "").trim();
      const student_id = (s.student_id || "").trim();
      const gender = (s.gender || "").trim();
      const classNum = parseInt(s.class_num) || null;
      const password = s.password || "123456";

      if (!name || !student_id) {
        results.push({ name, student_id, status: "跳过", error: "缺少姓名或学号" });
        continue;
      }

      const email = `${student_id}@ai-game.student`;

      try {
        if (i > 0) await delay(600);

        const { data: signUpData, error: signUpError } = await db.auth.signUp({
          email,
          password,
          options: {
            data: { name, student_id },
            emailRedirectTo: undefined,
          },
        });

        if (signUpError) {
          if (signUpError.message.includes("rate limit") || signUpError.message.includes("Rate limit")) {
            await delay(3000);
            const retryRes = await db.auth.signUp({
              email, password,
              options: { data: { name, student_id }, emailRedirectTo: undefined },
            });
            if (retryRes.error) {
              results.push({ name, student_id, status: "失败", error: "频率限制: " + retryRes.error.message });
              continue;
            }
            if (!retryRes.data.user) {
              results.push({ name, student_id, status: "失败", error: "Auth 用户未创建" });
              continue;
            }
            await insertStudentUser(db, retryRes.data.user.id, name, student_id, gender, g, classNum, results);
            continue;
          }
          // 用户已存在（学号冲突）
          if (signUpError.message.includes("already registered") || signUpError.message.includes("already been registered")) {
            results.push({ name, student_id, status: "跳过", error: "学号已存在" });
            continue;
          }
          results.push({ name, student_id, status: "失败", error: signUpError.message });
          continue;
        }

        if (!signUpData.user) {
          results.push({ name, student_id, status: "失败", error: "Auth 用户未创建" });
          continue;
        }

        await insertStudentUser(db, signUpData.user.id, name, student_id, gender, g, classNum, results);
      } catch (err: any) {
        results.push({ name, student_id, status: "异常", error: err.message });
      }
    }

    const successCount = results.filter((r) => r.status === "成功").length;
    return NextResponse.json({
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
      details: results,
    });
  } catch (error: any) {
    console.error("[批量导入] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== DELETE: 删除学生 ====================
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    // 先删除数据库记录，再删除 auth 用户
    // 这样如果 DB 删除失败，auth 用户仍然存在
    const { error: dbError } = await db.from("users").delete().eq("id", userId);
    if (dbError) {
      console.error("[删除学生] 数据库删除失败:", dbError);
      return NextResponse.json({ error: "数据库删除失败: " + dbError.message }, { status: 500 });
    }

    // 删除 auth 用户（即使失败也不回滚 DB 删除）
    try {
      await db.auth.admin.deleteUser(userId);
    } catch (authErr: any) {
      console.error("[删除学生] Auth 删除失败（DB 已删除）:", authErr);
      // DB 已删除，auth 删除失败不影响返回成功
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[删除学生] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== PATCH: 更新学生信息 ====================
export async function PATCH(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();
    const body = await req.json();
    const { id, name, student_id, gender, grade, class_num } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少学生 ID" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (student_id !== undefined) updateData.student_id = student_id;
    if (gender !== undefined) updateData.gender = gender;
    if (grade !== undefined) updateData.grade = parseInt(grade);
    if (class_num !== undefined) updateData.class_num = parseInt(class_num);

    const { error } = await db.from("users").update(updateData).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[更新学生] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 写入 users 表
async function insertStudentUser(
  db: ReturnType<typeof getDB>,
  userId: string,
  name: string,
  student_id: string,
  gender: string,
  grade: number,
  classNum: number | null,
  results: any[]
) {
  const { error: insertError } = await db.from("users").insert({
    id: userId,
    name,
    student_id,
    role: "student",
    gender: gender || null,
    grade,
    class_num: classNum,
  });

  if (insertError) {
    // 降级：尝试 update
    const { error: updateError } = await db
      .from("users")
      .update({ name, student_id, role: "student", gender: gender || null, grade, class_num: classNum })
      .eq("id", userId);

    if (updateError) {
      results.push({ name, student_id, status: "失败", error: updateError.message });
      return;
    }
  }
  results.push({ name, student_id, status: "成功" });
}
