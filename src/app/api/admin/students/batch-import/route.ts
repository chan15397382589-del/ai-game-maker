import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import * as XLSX from "xlsx";

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const admin = await getVerifiedAdmin(token);
    if (admin instanceof NextResponse) return admin;

    const db = getDB();

    // 解析 form-data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请上传 Excel 文件" }, { status: 400 });
    }

    // 读取 Excel
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 转为 JSON，期望列名为 "姓名" 和 "学号"
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Excel 文件为空" }, { status: 400 });
    }

    const results: { name: string; student_id: string; status: string; error?: string }[] = [];

    for (const row of rows) {
      // 兼容多种列名写法
      const name = row["姓名"] || row["name"] || row["Name"] || "";
      const student_id =
        String(row["学号"] || row["student_id"] || row["StudentId"] || row["studentId"] || "").trim();

      if (!name || !student_id) {
        results.push({ name, student_id, status: "跳过", error: "缺少姓名或学号" });
        continue;
      }

      const email = `${student_id}@ai-game.student`;
      const password = "123456";

      try {
        // 创建 Auth 用户
        const { data: signUpData, error: signUpError } = await db.auth.signUp({
          email,
          password,
          options: {
            data: { name, student_id },
            emailRedirectTo: undefined,
          },
        });

        if (signUpError) {
          results.push({ name, student_id, status: "失败", error: signUpError.message });
          continue;
        }

        if (!signUpData.user) {
          results.push({ name, student_id, status: "失败", error: "Auth 用户未创建" });
          continue;
        }

        // 写入 users 表
        const { error: insertError } = await db.from("users").insert({
          id: signUpData.user.id,
          name,
          student_id,
          role: "student",
        });

        if (insertError) {
          // 可能触发器已创建，尝试更新
          const { error: updateError } = await db
            .from("users")
            .update({ name, student_id, role: "student" })
            .eq("id", signUpData.user.id);

          if (updateError) {
            results.push({ name, student_id, status: "失败", error: updateError.message });
            continue;
          }
        }

        results.push({ name, student_id, status: "成功" });
      } catch (err: any) {
        results.push({ name, student_id, status: "异常", error: err.message });
      }
    }

    const successCount = results.filter((r) => r.status === "成功").length;
    const failCount = results.filter((r) => r.status !== "成功").length;

    return NextResponse.json({
      total: results.length,
      success: successCount,
      failed: failCount,
      details: results,
    });
  } catch (error: any) {
    console.error("[批量导入] 失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
