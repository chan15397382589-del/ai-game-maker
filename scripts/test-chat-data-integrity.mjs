import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createSingleFlightWrite,
  formatAssistantFailureRecord,
  runMessageWriteWithRetry,
} from "../src/lib/chat-message-integrity.ts";

let attempts = 0;
await runMessageWriteWithRetry(async () => {
  attempts += 1;
  if (attempts < 3) throw new Error("temporary database failure");
}, { delayMs: 0, maxAttempts: 3, context: "测试消息" });
assert.equal(attempts, 3, "消息保存必须在瞬时失败后重试");

await assert.rejects(
  runMessageWriteWithRetry(
    async () => { throw new Error("database unavailable"); },
    { delayMs: 0, maxAttempts: 3, context: "失败消息" },
  ),
  /失败消息.*3次尝试.*database unavailable/,
  "消息保存重试耗尽后必须抛错，禁止静默丢失",
);

const partial = "已经生成的AI正文\n```html\n<html>部分代码</html>\n```";
const failureRecord = formatAssistantFailureRecord("流式响应中断", partial);
assert(failureRecord.startsWith(partial), "AI流中断时必须先保留已经生成的正文和HTML代码");
assert(failureRecord.includes("流式响应中断"), "AI异常记录必须包含可研究的失败原因");

let releaseWrite;
const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
const savedContents = [];
const singleFlightWrite = createSingleFlightWrite(async (content) => {
  savedContents.push(content);
  await writeGate;
});
const normalSave = singleFlightWrite("完整AI回复");
const timeoutSave = singleFlightWrite("超时异常记录");
assert.equal(normalSave, timeoutSave, "正常结束与超时竞态必须复用同一次AI写入");
releaseWrite();
await Promise.all([normalSave, timeoutSave]);
assert.deepEqual(savedContents, ["完整AI回复"], "同一轮AI回复不得因超时竞态重复插入");

const cleanupRoute = await readFile(new URL("../src/app/api/admin/cleanup-code-messages/route.ts", import.meta.url), "utf8");
assert(!cleanupRoute.includes(".delete("), "历史危险接口不得继续删除包含HTML的AI消息");
assert(/status:\s*410/.test(cleanupRoute), "历史危险接口必须明确返回410 Gone");

const chatRoute = await readFile(new URL("../src/app/api/chat/route.ts", import.meta.url), "utf8");
for (const reason of ["AI服务连接失败", "AI返回空内容", "流式响应中断"]) {
  assert(chatRoute.includes(`formatAssistantFailureRecord(\"${reason}\"`), `聊天接口必须持久化异常路径：${reason}`);
}

console.log(JSON.stringify({ ok: true, attempts, singleFlightWrites: savedContents.length, failureRecordLength: failureRecord.length }));
