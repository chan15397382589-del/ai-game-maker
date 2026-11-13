import type { SupabaseClient } from "@supabase/supabase-js";
import { CAT_RUBRIC_VERSION, catHtmlHash, newAnonymousCode, shuffledOrders } from "@/lib/cat-evaluation";
import { catReviewerCodeForNumber, catReviewerEmailForNumber } from "@/lib/cat-login";

type DB = SupabaseClient;

function requireText(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > maxLength) {
    throw new Error(`${label}须为2–${maxLength}字`);
  }
  return value.trim();
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label}不是有效UUID`);
  }
  return value;
}

type CatSourceType = "projects" | "conversations" | "game_snapshots";

function requireSource(type: unknown, id: unknown): { type: CatSourceType; id: string } {
  if (type !== "projects" && type !== "conversations" && type !== "game_snapshots") {
    throw new Error("作品来源无效");
  }
  if (type === "conversations") return { type, id: requireUuid(id, "会话ID") };
  const number = Number(id);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("作品来源ID无效");
  return { type, id: String(number) };
}

async function sourceCandidate(db: DB, type: unknown, id: unknown) {
  const source = requireSource(type, id);
  const columns = source.type === "projects"
    ? "id,user_id,game_title,html_code,created_at,updated_at"
    : source.type === "conversations"
      ? "id,user_id,title,html_code,created_at,updated_at"
      : "id,user_id,conversation_id,html_code,created_at";
  const query: any = db.from(source.type).select(columns);
  const { data, error } = await query.eq("id", source.id).single();
  throwOnError(error);
  if (!data) throw new Error("候选作品不存在");
  if (source.type === "game_snapshots" && data.conversation_id) {
    const { data: conversation, error: relationError } = await db.from("conversations")
      .select("user_id").eq("id", data.conversation_id).maybeSingle();
    throwOnError(relationError);
    if (conversation && conversation.user_id !== data.user_id) throw new Error("快照与会话的学生ID不一致，请先核查原始数据");
  }
  return {
    source_type: source.type,
    source_id: source.id,
    user_id: data.user_id as string,
    game_title: (source.type === "projects" ? data.game_title : source.type === "conversations" ? data.title : `游戏快照 ${source.id}`) || "未命名游戏",
    html_code: data.html_code as string | null,
    created_at: data.created_at as string,
    content_at: (data.updated_at || data.created_at) as string,
    linked_conversation_id: source.type === "game_snapshots" ? data.conversation_id as string | null : source.type === "conversations" ? source.id : null,
  };
}

function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function fetchAll(db: DB, table: string, columns: string, configure?: (query: any) => any): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query: any = db.from(table).select(columns).range(offset, offset + pageSize - 1);
    if (configure) query = configure(query);
    const { data, error } = await query;
    throwOnError(error);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

async function getDraftBatch(db: DB, batchId: unknown): Promise<any> {
  const id = requireUuid(batchId, "评分批次ID");
  const { data, error } = await db.from("cat_batches").select("id,name,grade,status,task_label").eq("id", id).single();
  throwOnError(error);
  if (!data) throw new Error("评分批次不存在");
  if (data.status !== "draft") throw new Error("该批次已开始或结束，不能更改评分样本");
  return data;
}

async function requireIndependentReviewer(db: DB, reviewerId: string) {
  const { data: reviewer, error: reviewerError } = await db.from("cat_reviewers")
    .select("id,expert_name,auth_user_id").eq("id", reviewerId).single();
  throwOnError(reviewerError);
  if (!reviewer || !reviewer.expert_name?.trim()) throw new Error("请先核实并登记专家实名");
  const [{ data: auth, error: authError }, { data: platformUser, error: platformError }] = await Promise.all([
    db.auth.admin.getUserById(reviewer.auth_user_id),
    db.from("users").select("id").eq("id", reviewer.auth_user_id).maybeSingle(),
  ]);
  throwOnError(authError);
  throwOnError(platformError);
  if (!auth.user) throw new Error("专家登录账号不存在");
  if (platformUser) throw new Error("该专家账号与学生或管理员账号冲突，不能分配");
  return reviewer;
}

export async function catAdminOverview(db: DB, batchId?: string) {
  const [batches, reviewers] = await Promise.all([
    fetchAll(db, "cat_batches", "id,name,grade,task_label,rubric_version,status,created_at,opened_at,closed_at", (q) => q.order("created_at", { ascending: false })),
    fetchAll(db, "cat_reviewers", "id,auth_user_id,expert_name,reviewer_code,created_at", (q) => q.order("reviewer_code")),
  ]);
  const reviewerAccounts = await Promise.all(reviewers.map(async (reviewer) => {
    const { data, error } = await db.auth.admin.getUserById(reviewer.auth_user_id);
    return { ...reviewer, email: data.user?.email || "账号不可用", auth_available: !error && !!data.user };
  }));
  if (!batchId) return { batches, reviewers: reviewerAccounts };
  const batch = batches.find((row) => row.id === batchId);
  if (!batch) throw new Error("评分批次不存在");
  const [artifacts, batchReviewers, scores] = await Promise.all([
    fetchAll(db, "cat_artifacts", "id,batch_id,student_user_id,student_code,anonymous_code,source_type,source_project_id,source_record_id,source_created_at,source_content_at,game_title,html_sha256,selection_note,frozen_at", (q) => q.eq("batch_id", batchId).order("student_code")),
    fetchAll(db, "cat_batch_reviewers", "reviewer_id", (q) => q.eq("batch_id", batchId)),
    fetchAll(db, "cat_scores", "id,artifact_id,reviewer_id,submitted_at", (q) => q.eq("batch_id", batchId)),
  ]);
  const reviewerProgress = Object.fromEntries(reviewerAccounts.map((reviewer) => {
    const assigned = scores.filter((row) => row.reviewer_id === reviewer.id);
    return [reviewer.id, { assigned: assigned.length, submitted: assigned.filter((row) => row.submitted_at).length }];
  }));
  const response: Record<string, unknown> = { batches, reviewers: reviewerAccounts, batch, artifacts, batchReviewers, reviewerProgress, scoreCount: scores.length, submittedCount: scores.filter((row) => row.submitted_at).length };
  if (batch.status === "draft") {
    const students = await fetchAll(db, "users", "id,name,student_id,grade,class_num,srl_condition", (q) => q.eq("role", "student").eq("grade", batch.grade).order("student_id"));
    const candidates: any[] = [];
    for (let index = 0; index < students.length; index += 200) {
      const ids = students.slice(index, index + 200).map((student) => student.id);
      if (!ids.length) continue;
      const [projects, conversations, snapshots] = await Promise.all([
        fetchAll(db, "projects", "id,user_id,game_title,is_published,created_at,updated_at", (q) => q.in("user_id", ids).not("html_code", "is", null).neq("html_code", "").order("created_at", { ascending: false })),
        fetchAll(db, "conversations", "id,user_id,title,created_at,updated_at", (q) => q.in("user_id", ids).not("html_code", "is", null).neq("html_code", "").order("created_at", { ascending: false })),
        fetchAll(db, "game_snapshots", "id,user_id,conversation_id,created_at", (q) => q.in("user_id", ids).not("html_code", "is", null).neq("html_code", "").order("created_at", { ascending: false })),
      ]);
      candidates.push(...projects.map((row) => ({ ...row, source_type: "projects", source_id: String(row.id), content_at: row.updated_at || row.created_at })));
      candidates.push(...conversations.map((row) => ({ ...row, source_type: "conversations", source_id: row.id, game_title: row.title || "未命名会话", content_at: row.updated_at || row.created_at })));
      candidates.push(...snapshots.map((row) => ({ ...row, source_type: "game_snapshots", source_id: String(row.id), game_title: `游戏快照 ${row.id}`, content_at: row.created_at })));
    }
    response.students = students;
    response.candidates = candidates;
  }
  return response;
}

export async function catAdminAction(db: DB, adminId: string, input: Record<string, unknown>) {
  switch (input.action) {
    case "create_batch": {
      const grade = Number(input.grade);
      if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error("年级无效");
      const { data, error } = await db.from("cat_batches").insert({
        name: requireText(input.name, "批次名称"),
        grade,
        task_label: requireText(input.task_label, "任务名称"),
        rubric_version: CAT_RUBRIC_VERSION,
        created_by: adminId,
      }).select("id").single();
      throwOnError(error);
      if (!data) throw new Error("评分批次创建失败");
      return { batchId: data.id };
    }

    case "register_reviewer": {
      const numberedLogin = input.login_number !== undefined;
      const reviewerCode = numberedLogin ? catReviewerCodeForNumber(input.login_number) : requireText(input.reviewer_code, "评审者匿名编号", 40);
      const expertName = input.expert_name ? requireText(input.expert_name, "专家姓名", 100) : null;
      let authUserId: string;
      let newlyCreated = false;
      if (numberedLogin || input.email) {
        const email = numberedLogin ? catReviewerEmailForNumber(input.login_number) : requireText(input.email, "评审者邮箱", 254).toLowerCase();
        const password = input.password;
        if (typeof password !== "string" || password.length < 12) throw new Error("评审者初始密码至少12位");
        const { data: created, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { ...(expertName ? { name: expertName } : {}), account_kind: "cat_reviewer" } });
        throwOnError(createError);
        if (!created.user) throw new Error("评审账号创建失败");
        authUserId = created.user.id;
        newlyCreated = true;
      } else {
        authUserId = requireUuid(input.auth_user_id, "评审者Auth用户ID");
      }
      try {
        const { data: authData, error: authError } = await db.auth.admin.getUserById(authUserId);
        throwOnError(authError);
        if (!authData.user) throw new Error("Supabase Auth中未找到该评审账号");
        const { data: platformUser, error: userError } = await db.from("users").select("role,student_id").eq("id", authUserId).maybeSingle();
        throwOnError(userError);
        if (platformUser) {
          // 历史 on_auth_user_created 触发器可能把刚创建的专家误登记为学生。
          if (!newlyCreated || platformUser.role !== "student") {
            throw new Error("评审账号不得同时是学生或管理员账号");
          }
          const { error: deleteError } = await db.from("users").delete()
            .eq("id", authUserId).eq("role", "student");
          throwOnError(deleteError);
        }
        const { data, error } = await db.from("cat_reviewers").insert({ auth_user_id: authUserId, expert_name: expertName, reviewer_code: reviewerCode, created_by: adminId }).select("id").single();
        throwOnError(error);
        if (!data) throw new Error("评审账号登记失败");
        return { reviewerId: data.id };
      } catch (error) {
        if (newlyCreated) {
          const { error: cleanupError } = await db.auth.admin.deleteUser(authUserId);
          if (cleanupError) console.error("[CAT] 新建评审账号回滚失败：", authUserId, cleanupError.message);
        }
        throw error;
      }
    }

    case "update_reviewer_name": {
      const reviewerId = requireUuid(input.reviewer_id, "评审者ID");
      const expertName = requireText(input.expert_name, "专家姓名", 100);
      const { data, error } = await db.from("cat_reviewers")
        .update({ expert_name: expertName }).eq("id", reviewerId).is("expert_name", null).select("id").maybeSingle();
      throwOnError(error);
      if (!data) throw new Error("专家账号不存在，或姓名已登记；已登记姓名不允许无审计地改写");
      return { success: true };
    }

    case "add_reviewer": {
      const batch = await getDraftBatch(db, input.batch_id);
      const reviewerId = requireUuid(input.reviewer_id, "评审者ID");
      await requireIndependentReviewer(db, reviewerId);
      const { count, error: countError } = await db.from("cat_batch_reviewers").select("reviewer_id", { count: "exact", head: true }).eq("batch_id", batch.id);
      throwOnError(countError);
      if ((count || 0) >= 5) throw new Error("每批最多5位评审者");
      const { error } = await db.from("cat_batch_reviewers").insert({ batch_id: batch.id, reviewer_id: reviewerId });
      throwOnError(error);
      return { success: true };
    }

    case "remove_reviewer": {
      const batch = await getDraftBatch(db, input.batch_id);
      const reviewerId = requireUuid(input.reviewer_id, "评审者ID");
      const { count, error: countError } = await db.from("cat_scores")
        .select("id", { count: "exact", head: true }).eq("batch_id", batch.id);
      throwOnError(countError);
      if (count) throw new Error("评分任务已经生成，不能移除专家；请先核查该批次");
      const { error } = await db.from("cat_batch_reviewers").delete()
        .eq("batch_id", batch.id).eq("reviewer_id", reviewerId);
      throwOnError(error);
      return { success: true };
    }

    case "freeze_artifact": {
      const batch = await getDraftBatch(db, input.batch_id);
      if (input.confirm_student_submission !== true) throw new Error("请先核实这是学生最终提交的原始作品，不是事后修复版");
      const project = await sourceCandidate(db, input.source_type || "projects", input.source_id || input.project_id);
      const { data: student, error: studentError } = await db.from("users")
        .select("id,student_id,grade,role")
        .eq("id", project.user_id).single();
      throwOnError(studentError);
      if (!student) throw new Error("作品所属学生不存在");
      if (student.role !== "student" || student.grade !== batch.grade) throw new Error("作品不属于该批次年级的学生");
      if (!project.html_code || project.html_code.trim().length < 100) throw new Error("作品HTML缺失或过短，须先核查原始数据");
      if (input.expected_sha256 !== catHtmlHash(project.html_code)) throw new Error("候选作品在预览后发生变化，请重新预览并核实");
      const note = typeof input.selection_note === "string" ? input.selection_note.trim() : "";
      if (note.length < 6 || note.length > 1000) throw new Error("请填写6–1000字的最终作品选择依据");
      const { data, error } = await db.from("cat_artifacts").insert({
        batch_id: batch.id,
        student_user_id: student.id,
        student_code: student.student_id,
        anonymous_code: newAnonymousCode(),
        source_type: project.source_type,
        source_project_id: project.source_type === "projects" ? Number(project.source_id) : null,
        source_record_id: project.source_id,
        source_created_at: project.created_at,
        source_content_at: project.content_at,
        game_title: project.game_title || "未命名游戏",
        selection_note: note,
        html_code: project.html_code,
        html_sha256: catHtmlHash(project.html_code),
        frozen_by: adminId,
      }).select("id,anonymous_code,html_sha256").single();
      throwOnError(error);
      return data;
    }

    case "open_batch": {
      const batch = await getDraftBatch(db, input.batch_id);
      const [reviewerRows, artifactRows] = await Promise.all([
        fetchAll(db, "cat_batch_reviewers", "reviewer_id", (q) => q.eq("batch_id", batch.id)),
        fetchAll(db, "cat_artifacts", "id", (q) => q.eq("batch_id", batch.id)),
      ]);
      if (reviewerRows.length < 3 || reviewerRows.length > 5) throw new Error("正式评分须有3–5位独立评审者");
      if (!artifactRows.length) throw new Error("批次没有冻结作品");
      await Promise.all(reviewerRows.map((row) => requireIndependentReviewer(db, row.reviewer_id)));
      const expected = reviewerRows.length * artifactRows.length;
      const { count, error: countError } = await db.from("cat_scores").select("id", { count: "exact", head: true }).eq("batch_id", batch.id);
      throwOnError(countError);
      if (count !== 0 && count !== expected) throw new Error("评分任务部分创建，请先核查数据库，不自动重排");
      if (count === 0) {
        const rows = reviewerRows.flatMap(({ reviewer_id }) => shuffledOrders(artifactRows).map((artifact, index) => ({
          batch_id: batch.id,
          artifact_id: artifact.id,
          reviewer_id,
          display_order: index + 1,
        })));
        const { error } = await db.from("cat_scores").insert(rows);
        throwOnError(error);
      }
      const { error } = await db.from("cat_batches").update({ status: "open", opened_at: new Date().toISOString() }).eq("id", batch.id).eq("status", "draft");
      throwOnError(error);
      return { success: true, assignments: expected };
    }

    case "close_batch": {
      const batchId = requireUuid(input.batch_id, "评分批次ID");
      const { data: batch, error: batchError } = await db.from("cat_batches").select("status").eq("id", batchId).single();
      throwOnError(batchError);
      if (!batch) throw new Error("评分批次不存在");
      if (batch.status !== "open") throw new Error("只有进行中的批次可以结项");
      const { count: remaining, error: countError } = await db.from("cat_scores").select("id", { count: "exact", head: true }).eq("batch_id", batchId).is("submitted_at", null);
      throwOnError(countError);
      if (remaining) throw new Error(`还有${remaining}份评分未提交，不能结项`);
      const { error } = await db.from("cat_batches").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", batchId);
      throwOnError(error);
      return { success: true };
    }

    default:
      throw new Error("未知的CAT管理操作");
  }
}

export async function catAdminProjectPreview(db: DB, batchId: unknown, sourceType: unknown, sourceId: unknown) {
  const batch = await getDraftBatch(db, batchId);
  const project = await sourceCandidate(db, sourceType, sourceId);
  const { data: student, error: studentError } = await db.from("users")
    .select("student_id,grade")
    .eq("id", project.user_id).single();
  throwOnError(studentError);
  if (!student) throw new Error("作品所属学生不存在");
  if (student.grade !== batch.grade) throw new Error("作品不属于该批次年级");
  return { ...project, student_code: student.student_id, html_sha256: catHtmlHash(project.html_code || "") };
}
