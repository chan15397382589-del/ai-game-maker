import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/deepseek";
import { meanOfNumbers } from "@/lib/cat-evaluation";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

async function allRows(table: string, columns: string, field: string, value: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from(table).select(columns).eq(field, value).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}

function csvValue(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // 避免把学生文本或作品标题作为电子表格公式执行。
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(headers: string[], rows: unknown[][]): string {
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
}

function sampleSd(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = meanOfNumbers(values)!;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const admin = await getVerifiedAdmin(token);
  if (admin instanceof NextResponse) return admin;
  try {
    const params = new URL(request.url).searchParams;
    const batchId = params.get("batch_id") || "";
    const kind = params.get("kind");
    if (!/^[0-9a-f-]{36}$/i.test(batchId) || !["raw", "summary", "reviewers"].includes(kind || "")) throw new Error("导出参数无效");
    const { data: batch, error: batchError } = await supabaseAdmin.from("cat_batches")
      .select("id,name,grade,task_label,rubric_version,status").eq("id", batchId).single();
    if (batchError) throw batchError;
    if (!batch) throw new Error("评分批次不存在");
    if (batch.status !== "closed") throw new Error("只有已结束的批次可以导出正式评分结果");
    const [artifacts, scores, reviewers] = await Promise.all([
      allRows("cat_artifacts", "id,student_user_id,student_code,anonymous_code,source_type,source_record_id,source_project_id,source_created_at,source_content_at,html_sha256,selection_note,frozen_at", "batch_id", batchId),
      allRows("cat_scores", "artifact_id,reviewer_id,display_order,overall_creativity,playability,note,submitted_at", "batch_id", batchId),
      allRows("cat_batch_reviewers", "reviewer_id", "batch_id", batchId),
    ]);
    const users: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabaseAdmin.from("users")
        .select("id,name,student_id,grade,class_num,srl_condition").eq("role", "student").eq("grade", batch.grade).order("student_id").range(offset, offset + 499);
      if (error) throw error;
      users.push(...(data || []));
      if ((data || []).length < 500) break;
    }
    const userMap = new Map(users.map((user) => [user.id, user]));
    const reviewerIds = reviewers.map((row) => row.reviewer_id);
    const { data: reviewerRows, error: reviewerError } = await supabaseAdmin.from("cat_reviewers")
      .select("id,reviewer_code,expert_name,auth_user_id,created_at").in("id", reviewerIds);
    if (reviewerError) throw reviewerError;
    const reviewerMap = new Map((reviewerRows || []).map((row) => [row.id, row.reviewer_code]));
    const artifactMap = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    let content: string;
    if (kind === "reviewers") {
      const headers = ["批次ID", "批次名称", "专家编号", "专家姓名", "登录邮箱", "Auth用户ID", "账号创建时间", "分配作品数", "已提交评分数"];
      const rows = await Promise.all((reviewerRows || []).map(async (reviewer) => {
        const { data: auth, error: authError } = await supabaseAdmin.auth.admin.getUserById(reviewer.auth_user_id);
        if (authError || !auth.user) throw new Error(`专家账号 ${reviewer.reviewer_code} 无法核验，停止导出索引`);
        const ownScores = scores.filter((score) => score.reviewer_id === reviewer.id);
        return [batch.id, batch.name, reviewer.reviewer_code, reviewer.expert_name, auth.user.email, reviewer.auth_user_id, reviewer.created_at, ownScores.length, ownScores.filter((score) => score.submitted_at).length];
      }));
      content = csv(headers, rows);
    } else if (kind === "raw") {
      const headers = ["批次ID", "批次名称", "量规版本", "学生ID", "学生姓名", "班级", "SRL组别", "匿名作品编号", "来源表", "来源记录ID", "原始作品ID", "记录创建时间", "来源内容时间", "作品SHA256", "最终版选择依据", "冻结时间", "评审编号", "评审顺序", "总体创造力1-5", "试玩状态", "评分依据", "提交时间"];
      const rows = scores.map((score) => {
        const artifact = artifactMap.get(score.artifact_id);
        const student = userMap.get(artifact?.student_user_id);
        return [batch.id, batch.name, batch.rubric_version, artifact?.student_code, student?.name, student?.class_num, student?.srl_condition, artifact?.anonymous_code, artifact?.source_type, artifact?.source_record_id || artifact?.source_project_id, artifact?.source_project_id, artifact?.source_created_at, artifact?.source_content_at, artifact?.html_sha256, artifact?.selection_note, artifact?.frozen_at, reviewerMap.get(score.reviewer_id), score.display_order, score.overall_creativity, score.playability, score.note, score.submitted_at];
      });
      content = csv(headers, rows);
    } else {
      const scoresByArtifact = new Map<string, Row[]>();
      for (const score of scores) scoresByArtifact.set(score.artifact_id, [...(scoresByArtifact.get(score.artifact_id) || []), score]);
      const headers = ["批次ID", "批次名称", "学生ID", "学生姓名", "班级", "SRL组别", "作品状态", "匿名作品编号", "来源表", "来源记录ID", "原始作品ID", "来源内容时间", "作品SHA256", "最终版选择依据", "冻结时间", "评审人数", "有效分人数", "缺失人数", "总体创造力均值1-5", "总体创造力标准差", "无法查看人数"];
      const artifactByStudent = new Map(artifacts.map((artifact) => [artifact.student_user_id, artifact]));
      const roster: Row[] = [...users, ...artifacts.filter((artifact) => !userMap.has(artifact.student_user_id)).map((artifact) => ({ id: artifact.student_user_id, student_id: artifact.student_code }))];
      const rows = roster.map((student) => {
        const artifact = artifactByStudent.get(student.id);
        const these = artifact ? scoresByArtifact.get(artifact.id) || [] : [];
        const overall = these.map((score) => score.overall_creativity).filter((value): value is number => typeof value === "number");
        return [batch.id, batch.name, student.student_id, student.name, student.class_num, student.srl_condition, artifact ? "已冻结评分" : "未冻结（需核查，不等于无作品）", artifact?.anonymous_code, artifact?.source_type, artifact?.source_record_id || artifact?.source_project_id, artifact?.source_project_id, artifact?.source_content_at, artifact?.html_sha256, artifact?.selection_note, artifact?.frozen_at, artifact ? these.length : null, artifact ? overall.length : null, artifact ? these.length - overall.length : null, meanOfNumbers(overall), sampleSd(overall), artifact ? these.filter((score) => score.playability === "unavailable").length : null];
      });
      content = csv(headers, rows);
    }
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="CAT_${kind}_${batchId}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[CAT export]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败" }, { status: 400 });
  }
}
