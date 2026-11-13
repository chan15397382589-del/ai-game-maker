-- CAT 作品创造力评价。仅创建新表，不修改历史学生作品或对话。
-- 在完成数据库备份后，由管理员手动执行；本文件不会自动作用于生产库。

CREATE TABLE IF NOT EXISTS public.cat_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
  task_label TEXT NOT NULL CHECK (length(trim(task_label)) BETWEEN 2 AND 160),
  rubric_version TEXT NOT NULL DEFAULT 'CAT-1-5-v1' CHECK (rubric_version = 'CAT-1-5-v1'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.cat_reviewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  expert_name TEXT CHECK (expert_name IS NULL OR length(trim(expert_name)) BETWEEN 2 AND 100),
  reviewer_code TEXT NOT NULL UNIQUE CHECK (length(trim(reviewer_code)) BETWEEN 2 AND 40),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 兼容先前已执行过 CAT 初稿迁移的数据库。旧账号实名未知，保持 NULL 等管理员核实补录，绝不凭编号虚构姓名。
ALTER TABLE public.cat_reviewers ADD COLUMN IF NOT EXISTS expert_name TEXT;
ALTER TABLE public.cat_reviewers ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.cat_reviewers ALTER COLUMN expert_name DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.cat_batch_reviewers (
  batch_id UUID NOT NULL REFERENCES public.cat_batches(id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES public.cat_reviewers(id) ON DELETE RESTRICT,
  PRIMARY KEY (batch_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS public.cat_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.cat_batches(id) ON DELETE RESTRICT,
  student_user_id UUID NOT NULL,
  student_code TEXT NOT NULL,
  anonymous_code TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'projects',
  source_project_id BIGINT,
  source_record_id TEXT,
  source_created_at TIMESTAMPTZ NOT NULL,
  source_content_at TIMESTAMPTZ,
  game_title TEXT NOT NULL,
  selection_note TEXT NOT NULL DEFAULT '',
  html_code TEXT NOT NULL CHECK (length(html_code) > 0),
  html_sha256 TEXT NOT NULL CHECK (html_sha256 ~ '^[0-9a-f]{64}$'),
  frozen_by UUID NOT NULL,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, student_user_id),
  UNIQUE (batch_id, anonymous_code),
  UNIQUE (id, batch_id)
);

-- 兼容初稿只支持 projects 的表结构；旧冻结记录保留原样。
ALTER TABLE public.cat_artifacts ADD COLUMN IF NOT EXISTS source_record_id TEXT;
ALTER TABLE public.cat_artifacts ADD COLUMN IF NOT EXISTS source_content_at TIMESTAMPTZ;
ALTER TABLE public.cat_artifacts ALTER COLUMN source_project_id DROP NOT NULL;
ALTER TABLE public.cat_artifacts DROP CONSTRAINT IF EXISTS cat_artifacts_source_type_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cat_artifacts'::regclass AND conname = 'cat_artifacts_source_link_check'
  ) THEN
    ALTER TABLE public.cat_artifacts ADD CONSTRAINT cat_artifacts_source_link_check CHECK (
      (source_type = 'projects' AND source_project_id IS NOT NULL) OR
      (source_type IN ('conversations', 'game_snapshots') AND source_project_id IS NULL AND source_record_id IS NOT NULL)
    );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS cat_artifacts_batch_idx ON public.cat_artifacts(batch_id);

CREATE TABLE IF NOT EXISTS public.cat_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.cat_batches(id) ON DELETE RESTRICT,
  artifact_id UUID NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES public.cat_reviewers(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL CHECK (display_order > 0),
  overall_creativity SMALLINT CHECK (overall_creativity BETWEEN 1 AND 5),
  originality SMALLINT CHECK (originality BETWEEN 0 AND 3),
  design_appropriateness SMALLINT CHECK (design_appropriateness BETWEEN 0 AND 3),
  elaboration_coherence SMALLINT CHECK (elaboration_coherence BETWEEN 0 AND 3),
  playability TEXT CHECK (playability IN ('playable', 'partial', 'unplayable', 'unavailable')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (artifact_id, reviewer_id),
  UNIQUE (batch_id, reviewer_id, display_order),
  FOREIGN KEY (artifact_id, batch_id) REFERENCES public.cat_artifacts(id, batch_id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id, reviewer_id) REFERENCES public.cat_batch_reviewers(batch_id, reviewer_id) ON DELETE RESTRICT
);

-- 初稿要求三个辅助维度也必须给分；正式口径仅要求总体创造力 1–5 分。
-- 仅替换包含 submitted_at 与辅助维度的旧提交约束，不触及历史评分行。
DO $$
DECLARE old_check RECORD;
BEGIN
  FOR old_check IN
    SELECT conname, lower(pg_get_constraintdef(oid)) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.cat_scores'::regclass AND contype = 'c'
  LOOP
    IF old_check.definition LIKE '%submitted_at%'
       AND old_check.definition LIKE '%originality%'
       AND old_check.definition LIKE '%design_appropriateness%'
       AND old_check.definition LIKE '%elaboration_coherence%' THEN
      EXECUTE format('ALTER TABLE public.cat_scores DROP CONSTRAINT %I', old_check.conname);
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cat_scores'::regclass AND conname = 'cat_scores_submission_check'
  ) THEN
    ALTER TABLE public.cat_scores ADD CONSTRAINT cat_scores_submission_check CHECK (
      submitted_at IS NULL OR
      (playability IS NOT NULL AND (
        (playability = 'unavailable' AND overall_creativity IS NULL AND originality IS NULL
          AND design_appropriateness IS NULL AND elaboration_coherence IS NULL AND length(trim(note)) > 0) OR
        (playability IN ('playable', 'partial', 'unplayable') AND overall_creativity IS NOT NULL)
      ))
    );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS cat_scores_reviewer_idx ON public.cat_scores(reviewer_id, batch_id, display_order);

-- 评分和冻结作品只经由经过身份校验的服务端写入。前端匿名密钥无直接读写策略。
ALTER TABLE public.cat_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_batch_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_scores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cat_guard_frozen_artifact()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CAT frozen artifacts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS cat_artifact_immutable ON public.cat_artifacts;
CREATE TRIGGER cat_artifact_immutable
  BEFORE UPDATE OR DELETE ON public.cat_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.cat_guard_frozen_artifact();

CREATE OR REPLACE FUNCTION public.cat_guard_score_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted CAT scores cannot be changed';
  END IF;
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.artifact_id IS DISTINCT FROM OLD.artifact_id
     OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
     OR NEW.display_order IS DISTINCT FROM OLD.display_order THEN
    RAISE EXCEPTION 'CAT assignment identity cannot be changed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cat_score_guard ON public.cat_scores;
CREATE TRIGGER cat_score_guard
  BEFORE UPDATE ON public.cat_scores
  FOR EACH ROW EXECUTE FUNCTION public.cat_guard_score_update();

COMMENT ON TABLE public.cat_artifacts IS '每名学生每批一件冻结的最终作品；不随原始projects变化';
COMMENT ON TABLE public.cat_scores IS 'CAT专家独立评分：每件作品每位专家给出总体创造力1-5分；其他维度保留为可空的兼容字段，不参与正式评分';
COMMENT ON TABLE public.cat_reviewers IS '一个Supabase Auth账号对应一名专家；允许先建账号，正式分配评分前必须核实并登记实名；不与学生账号共用';
