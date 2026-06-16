import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/deepseek";
import { getVerifiedAdmin } from "@/lib/admin-auth";

// 按指定班级随机分配SRL条件（每班平均分配 srl_scaffold 和 control）
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const adminCheck = await getVerifiedAdmin(token);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const body = await req.json().catch(() => ({}));
    const { grade, class_num } = body;

    // 查询学生（可按年级/班级筛选）
    let query = supabaseAdmin
      .from("users")
      .select("id, grade, class_num")
      .eq("role", "student");

    if (grade) query = query.eq("grade", parseInt(grade));
    if (class_num) query = query.eq("class_num", parseInt(class_num));

    const { data: students, error } = await query.order("grade").order("class_num").limit(500);

    if (error) throw error;
    if (!students || students.length === 0) {
      return NextResponse.json({ message: "没有找到学生", assigned: 0 });
    }

    // 按年级+班级分组
    const groups: Record<string, typeof students> = {};
    students.forEach((s: any) => {
      const key = `${s.grade || 0}_${s.class_num || 0}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    let totalAssigned = 0;

    // 对每个班级内的学生进行随机分配
    for (const key of Object.keys(groups)) {
      const classStudents = groups[key];
      // Fisher-Yates 洗牌算法打乱顺序
      for (let i = classStudents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [classStudents[i], classStudents[j]] = [classStudents[j], classStudents[i]];
      }

      // 前一半分到 srl_scaffold，后一半分到 control
      const mid = Math.ceil(classStudents.length / 2);
      const scaffoldIds = classStudents.slice(0, mid).map((s: any) => s.id);
      const controlIds = classStudents.slice(mid).map((s: any) => s.id);

      // 批量更新
      if (scaffoldIds.length > 0) {
        const { error: e1 } = await supabaseAdmin
          .from("users")
          .update({ srl_condition: "srl_scaffold" })
          .in("id", scaffoldIds);
        if (e1) console.error("Update scaffold error:", e1);
      }

      if (controlIds.length > 0) {
        const { error: e2 } = await supabaseAdmin
          .from("users")
          .update({ srl_condition: "control" })
          .in("id", controlIds);
        if (e2) console.error("Update control error:", e2);
      }

      totalAssigned += classStudents.length;
    }

    return NextResponse.json({
      message: `成功分配 ${totalAssigned} 名学生`,
      assigned: totalAssigned,
      details: Object.entries(groups).map(([key, list]) => ({
        grade_class: key,
        total: list.length,
        scaffold: Math.ceil(list.length / 2),
        control: Math.floor(list.length / 2),
      })),
    });
  } catch (err: any) {
    console.error("Assign SRL error:", err);
    return NextResponse.json({ error: err.message || "分配失败" }, { status: 500 });
  }
}
