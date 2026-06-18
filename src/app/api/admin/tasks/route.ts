import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// GET - 获取所有学生的任务数据
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const adminCheck = await getVerifiedAdmin(token);
    if (adminCheck instanceof NextResponse) return adminCheck;

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");
    const grade = searchParams.get("grade");
    const classNum = searchParams.get("class_num");

    // 先获取任务数据
    let query = supabaseAdmin
      .from("student_tasks")
      .select("id, user_id, task_id, game_name, game_rules, design_image, design_reason, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data: tasks, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 批量获取用户信息
    const userIds = [...new Set((tasks || []).map((t: any) => t.user_id))];
    let userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, name, student_id, grade, class_num")
        .in("id", userIds);
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    // 组装结果，从 design_reason 中提取图片
    const tasksWithUsers = (tasks || []).map((t: any) => {
      let designImage = t.design_image || "";
      let imageHistory: any[] = [];
      let aiPrompt = "";

      // 从 design_reason 中提取图片历史
      try {
        const info = JSON.parse(t.design_reason || "{}");
        imageHistory = info.image_history || [];
        aiPrompt = info.ai_prompt || "";
        // 如果 design_image 为空，从 image_history 中取最新的图片
        if (!designImage && imageHistory.length > 0) {
          designImage = imageHistory[imageHistory.length - 1].url || "";
        }
      } catch {}

      return {
        ...t,
        design_image: designImage,
        image_history: imageHistory,
        ai_prompt: aiPrompt,
        design_reason: undefined, // 不返回原始 design_reason
        user: userMap[t.user_id] || null,
      };
    });

    // 过滤年级班级
    let filtered = tasksWithUsers;
    if (grade) {
      filtered = filtered.filter((t: any) => t.user?.grade === parseInt(grade));
    }
    if (classNum) {
      filtered = filtered.filter((t: any) => t.user?.class_num === parseInt(classNum));
    }

    return NextResponse.json(filtered);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
