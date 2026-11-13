import { createHash, randomBytes } from "node:crypto";

export const CAT_RUBRIC_VERSION = "CAT-1-5-v1";

export type CatPlayability = "playable" | "partial" | "unplayable" | "unavailable";

export interface CatScoreInput {
  overall_creativity: number | null;
  originality: number | null;
  design_appropriateness: number | null;
  elaboration_coherence: number | null;
  playability: CatPlayability | null;
  note: string;
}

function optionalInteger(value: unknown, min: number, max: number, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label}必须为${min}–${max}的整数`);
  }
  return value as number;
}

export function parseCatScoreInput(value: unknown, submit: boolean): CatScoreInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("评分格式错误");
  const row = value as Record<string, unknown>;
  const playability = row.playability === null || row.playability === undefined || row.playability === ""
    ? null
    : row.playability;
  if (playability !== null && !["playable", "partial", "unplayable", "unavailable"].includes(String(playability))) {
    throw new Error("试玩状态无效");
  }
  const note = typeof row.note === "string" ? row.note.trim() : "";
  if (note.length > 3000) throw new Error("评分依据最多3000字");
  const result: CatScoreInput = {
    overall_creativity: optionalInteger(row.overall_creativity, 1, 5, "总体创造力"),
    originality: optionalInteger(row.originality, 0, 3, "新颖性"),
    design_appropriateness: optionalInteger(row.design_appropriateness, 0, 3, "设计成立性"),
    elaboration_coherence: optionalInteger(row.elaboration_coherence, 0, 3, "精致性与契合性"),
    playability: playability as CatPlayability | null,
    note,
  };
  if (submit && result.playability === "unavailable") {
    if (!result.note) throw new Error("无法查看作品时，请写明原因");
    if ([result.overall_creativity, result.originality, result.design_appropriateness, result.elaboration_coherence].some((field) => field !== null)) {
      throw new Error("无法查看的作品不得填分数，不能以0分代替缺失");
    }
  } else if (submit && (result.overall_creativity === null || result.playability === null)) {
    throw new Error("正式提交前须填写总体创造力评分和试玩状态");
  }
  return result;
}

export function catHtmlHash(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

export function newAnonymousCode(): string {
  return `CAT-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function shuffledOrders<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const random = randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
    const other = Math.floor(random * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function meanOfNumbers(values: Array<number | null | undefined>): number | null {
  const actual = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return actual.length ? actual.reduce((sum, value) => sum + value, 0) / actual.length : null;
}
