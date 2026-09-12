import assert from "node:assert/strict";
import { runWithTransientRetry } from "../src/lib/supabase-query-retry.ts";

let transientCalls = 0;
const recovered = await runWithTransientRetry(
  async () => {
    transientCalls += 1;
    if (transientCalls < 3) throw new Error("Gateway Timeout");
    return "完整数据";
  },
  {
    context: "student_tasks design_image批次[id-1,id-2]",
    maxAttempts: 3,
    delayMs: 0,
  },
);
assert.equal(recovered, "完整数据");
assert.equal(transientCalls, 3, "瞬时Gateway Timeout应最多重试到成功");

let permanentCalls = 0;
await assert.rejects(
  runWithTransientRetry(
    async () => {
      permanentCalls += 1;
      throw new Error("column design_image does not exist");
    },
    { context: "student_tasks schema", maxAttempts: 3, delayMs: 0 },
  ),
  /student_tasks schema.*column design_image does not exist/,
);
assert.equal(permanentCalls, 1, "结构性错误不得重试");

let exhaustedCalls = 0;
await assert.rejects(
  runWithTransientRetry(
    async () => {
      exhaustedCalls += 1;
      throw Object.assign(new Error("fetch failed"), { status: 503 });
    },
    { context: "student_tasks design_image批次[id-9]", maxAttempts: 3, delayMs: 0 },
  ),
  /student_tasks design_image批次\[id-9\].*3次尝试.*fetch failed/,
);
assert.equal(exhaustedCalls, 3, "瞬时错误达到上限后必须终止导出，不能返回空数据");

console.log(JSON.stringify({ ok: true, transientCalls, permanentCalls, exhaustedCalls }));
