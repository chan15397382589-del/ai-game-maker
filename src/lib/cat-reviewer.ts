import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCatScoreInput } from "@/lib/cat-evaluation";

type DB = SupabaseClient;

function raise(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function verifiedCatReviewer(db: DB, token: string): Promise<{ id: string; reviewer_code: string } | null> {
  if (!token) return null;
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return null;
  const { data, error } = await db.from("cat_reviewers")
    .select("id,reviewer_code")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  raise(error);
  if (!data) return null;
  // 专家账号不能同时具有学生或管理员身份，避免在同一登录态跨门户访问。
  const { data: platformUser, error: roleError } = await db.from("users")
    .select("id").eq("id", auth.user.id).maybeSingle();
  raise(roleError);
  if (platformUser) return null;
  return data;
}

export async function catReviewerQueue(db: DB, reviewerId: string) {
  const scores: Array<{ id: string; batch_id: string; artifact_id: string; display_order: number; submitted_at: string | null }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("cat_scores")
      .select("id,batch_id,artifact_id,display_order,submitted_at")
      .eq("reviewer_id", reviewerId)
      .order("batch_id")
      .order("display_order")
      .range(offset, offset + 499);
    raise(error);
    scores.push(...(data || []));
    if ((data || []).length < 500) break;
  }
  if (!scores.length) return [];
  const batchIds = [...new Set(scores.map((score) => score.batch_id))];
  const artifactIds = [...new Set(scores.map((score) => score.artifact_id))];
  const batchMap = new Map<string, { status: string; rubric_version: string }>();
  const artifactMap = new Map<string, { anonymous_code: string }>();
  for (let index = 0; index < batchIds.length; index += 200) {
    const { data, error } = await db.from("cat_batches").select("id,status,rubric_version").in("id", batchIds.slice(index, index + 200));
    raise(error);
    for (const batch of data || []) batchMap.set(batch.id, batch);
  }
  for (let index = 0; index < artifactIds.length; index += 200) {
    const { data, error } = await db.from("cat_artifacts").select("id,anonymous_code").in("id", artifactIds.slice(index, index + 200));
    raise(error);
    for (const artifact of data || []) artifactMap.set(artifact.id, artifact);
  }
  return scores.filter((score) => batchMap.get(score.batch_id)?.status === "open").map((score) => ({
    id: score.id,
    anonymous_code: artifactMap.get(score.artifact_id)?.anonymous_code || "匿名作品",
    display_order: score.display_order,
    submitted_at: score.submitted_at,
    rubric_version: batchMap.get(score.batch_id)?.rubric_version,
  }));
}

export async function catReviewerAssignment(db: DB, reviewerId: string, assignmentId: string) {
  const { data: score, error: scoreError } = await db.from("cat_scores")
    .select("id,batch_id,artifact_id,reviewer_id,display_order,overall_creativity,originality,design_appropriateness,elaboration_coherence,playability,note,submitted_at")
    .eq("id", assignmentId).eq("reviewer_id", reviewerId).maybeSingle();
  raise(scoreError);
  if (!score) return null;
  const [{ data: batch, error: batchError }, { data: artifact, error: artifactError }] = await Promise.all([
    db.from("cat_batches").select("status,rubric_version").eq("id", score.batch_id).single(),
    db.from("cat_artifacts").select("anonymous_code,html_code,html_sha256").eq("id", score.artifact_id).single(),
  ]);
  raise(batchError);
  raise(artifactError);
  if (!batch || !artifact) throw new Error("评分作品或批次不存在");
  if (batch.status !== "open") return null;
  return {
    score,
    artifact,
    rubric_version: batch.rubric_version,
  };
}

export async function saveCatScore(db: DB, reviewerId: string, assignmentId: string, value: unknown, submit: boolean) {
  const { data: assignment, error: assignmentError } = await db.from("cat_scores")
    .select("id,batch_id,submitted_at")
    .eq("id", assignmentId).eq("reviewer_id", reviewerId).maybeSingle();
  raise(assignmentError);
  if (!assignment) throw new Error("评分任务不存在");
  if (assignment.submitted_at) throw new Error("这份评分已经正式提交，不能修改");
  const { data: batch, error: batchError } = await db.from("cat_batches").select("status").eq("id", assignment.batch_id).single();
  raise(batchError);
  if (!batch) throw new Error("评分批次不存在");
  if (batch.status !== "open") throw new Error("评分批次尚未开放或已经结束");
  const fields = parseCatScoreInput(value, submit);
  const { data, error } = await db.from("cat_scores")
    .update({ ...fields, submitted_at: submit ? new Date().toISOString() : null })
    .eq("id", assignmentId)
    .eq("reviewer_id", reviewerId)
    .is("submitted_at", null)
    .select("id,submitted_at,updated_at")
    .maybeSingle();
  raise(error);
  if (!data) throw new Error("评分状态已变化，请刷新后重试");
  return data;
}
