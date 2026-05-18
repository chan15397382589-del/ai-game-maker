/**
 * DeepSeek 流式并发测试
 * 模拟多名学生同时与 AI 对话，测试 DeepSeek API 的 RPM/TPM 限制
 *
 * ⚠️ 警告：此脚本会消耗 DeepSeek API 配额！
 *    建议先用 3 并发测试，确认无问题后再逐步增加到 10、20
 *
 * 用法:
 *   node load-test/deepseek-concurrency.js 3    # 3个并发（推荐先用这个）
 *   node load-test/deepseek-concurrency.js 10   # 10个并发
 *   node load-test/deepseek-concurrency.js 20   # 20个并发
 */

const BASE_URL = "http://localhost:3000";

// 极短的测试消息，最小化 token 消耗
const TEST_MESSAGE = "1"; // 只发数字1（模拟学生选第1个选项）

// 统计
let totalStarted = 0;
let totalCompleted = 0;
let totalErrors = 0;
let totalTimeout = 0;
const firstTokenTimes = []; // 首 token 延迟
const streamDurations = []; // 总流持续时间
const errors = [];

// 测试学生 tokens（需要真实有效的 token）
// 运行前请先修改为真实的学生 auth token
// 运行 node load-test/setup.js 自动填入真实 token
const TEST_TOKENS = [];

async function getStudentToken(studentId) {
  // 尝试用学号登录获取 token
  try {
    const email = `${studentId}@ai-game.student`;
    const res = await fetch(`${BASE_URL}/api/debug-auth`, { method: "POST" });
    return null;
  } catch {
    return null;
  }
}

async function testSingleChatStream(id, token) {
  totalStarted++;
  const startTime = Date.now();
  let firstTokenTime = null;
  let totalTokens = 0;
  let streamContent = "";
  let streamEnded = false;

  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: TEST_MESSAGE }],
        sessionId: null,
        currentCode: undefined,
      }),
      signal: AbortSignal.timeout(60000), // 60秒总超时
    });

    if (!response.ok) {
      const errText = await response.text();
      const elapsed = Date.now() - startTime;
      totalErrors++;
      errors.push({ id, status: response.status, body: errText.substring(0, 200), elapsed });
      return { id, ok: false, status: response.status, elapsed };
    }

    // 流式读取 SSE
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }

      if (!firstTokenTime) {
        firstTokenTime = Date.now() - startTime;
        firstTokenTimes.push(firstTokenTime);
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:") && !trimmed.includes("[DONE]")) {
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim());
            if (parsed.content) {
              streamContent += parsed.content;
              totalTokens++;
            }
            if (parsed.error) {
              totalErrors++;
              errors.push({ id, error: parsed.error });
            }
          } catch {}
        }
      }
    }

    const elapsed = Date.now() - startTime;
    if (streamEnded) {
      totalCompleted++;
      streamDurations.push(elapsed);
      return { id, ok: true, elapsed, firstTokenMs: firstTokenTime, tokens: totalTokens, preview: streamContent.substring(0, 60) };
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      totalTimeout++;
      errors.push({ id, error: "超时 (>60s)", elapsed });
    } else {
      totalErrors++;
      errors.push({ id, error: err.message, elapsed });
    }
    return { id, ok: false, elapsed, error: err.message };
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const concurrency = parseInt(process.argv[2]) || 3;

  console.log("═══════════════════════════════════════════");
  console.log("  DeepSeek 流式并发测试");
  console.log("═══════════════════════════════════════════");
  console.log(`  并发数: ${concurrency}`);
  console.log(`  每个请求消耗约 50-200 tokens`);
  console.log(`  预计总消耗: ${concurrency * 200}-${concurrency * 400} tokens\n`);

  // 检查 token
  if (TEST_TOKENS.length === 0) {
    console.log("⚠️  未配置 TEST_TOKENS。需要先获取真实的 auth token。\n");
    console.log("  获取方法：");
    console.log("  1. 浏览器打开 http://localhost:3000/login");
    console.log("  2. 登录一个学生账号");
    console.log("  3. 打开 F12 → Application → Local Storage");
    console.log("  4. 找到 sb-xxx-auth-token 的值");
    console.log("  5. 粘贴到本脚本的 TEST_TOKENS 数组中\n");
    console.log("  或者直接运行下面的 token 自动获取...\n");
  }

  // 尝试自动获取 token
  console.log("[准备] 尝试自动获取 token...");
  try {
    // 用 debug-auth 确认后端正常
    const checkRes = await fetch(`${BASE_URL}/api/debug-auth`);
    const checkData = await checkRes.json();
    console.log(`[准备] 后端状态: ${JSON.stringify(checkData)}\n`);
  } catch {
    console.log("[准备] ❌ 后端未启动！请先运行 npm run dev\n");
    process.exit(1);
  }

  if (TEST_TOKENS.length === 0) {
    console.log("❌ 没有可用的 auth token，无法继续测试。");
    console.log("   请在 TEST_TOKENS 数组中填入真实 token 后重试。\n");
    process.exit(1);
  }

  // 预热
  console.log("[预热] 发送 1 个请求确认 DeepSeek API 正常...");
  const token = TEST_TOKENS[0];
  const warmup = await testSingleChatStream("warmup", token);
  if (warmup.ok) {
    console.log(`[预热] ✅ 正常 首Token:${warmup.firstTokenMs}ms 总时长:${warmup.elapsed}ms\n`);
  } else {
    console.log(`[预热] ❌ 失败: ${JSON.stringify(warmup)}\n`);
    console.log("请确认 token 有效后再试");
    process.exit(1);
  }

  // 重置统计
  totalStarted = 0;
  totalCompleted = 0;
  totalErrors = 0;
  totalTimeout = 0;
  firstTokenTimes.length = 0;
  streamDurations.length = 0;
  errors.length = 0;

  await sleep(2000);

  // 并发测试
  console.log("───────────────────────────────────────────");
  console.log(`  开始 ${concurrency} 并发流式请求`);
  console.log("───────────────────────────────────────────\n");

  const startTime = Date.now();

  const tasks = [];
  for (let i = 0; i < concurrency; i++) {
    const tokenIdx = i % TEST_TOKENS.length;
    tasks.push(testSingleChatStream(`user-${i}`, TEST_TOKENS[tokenIdx]));
  }
  const results = await Promise.all(tasks);

  const totalTime = Date.now() - startTime;

  // 详细结果
  console.log("\n───────────────────────────────────────────");
  console.log("  详细结果");
  console.log("───────────────────────────────────────────\n");

  results.forEach((r) => {
    if (r.ok) {
      console.log(`  ✅ [${r.id}] 首Token:${r.firstTokenMs}ms 总:${r.elapsed}ms Tokens:${r.tokens} 预览:"${r.preview}"`);
    } else {
      console.log(`  ❌ [${r.id}] ${r.status || r.error} ${r.elapsed}ms`);
    }
  });

  // 汇总统计
  console.log("\n───────────────────────────────────────────");
  console.log("  汇总统计");
  console.log("───────────────────────────────────────────\n");

  console.log(`  总请求: ${totalStarted}`);
  console.log(`  ✅ 成功: ${totalCompleted}`);
  console.log(`  ❌ 错误: ${totalErrors}`);
  console.log(`  ⏰ 超时: ${totalTimeout}`);
  console.log(`  ⏱  总耗时: ${totalTime}ms`);

  if (firstTokenTimes.length > 0) {
    firstTokenTimes.sort((a, b) => a - b);
    const avgFt = Math.round(firstTokenTimes.reduce((a, b) => a + b, 0) / firstTokenTimes.length);
    console.log(`  ⏱  首Token平均: ${avgFt}ms | 最快: ${firstTokenTimes[0]}ms | 最慢: ${firstTokenTimes[firstTokenTimes.length - 1]}ms`);
  }

  if (streamDurations.length > 0) {
    streamDurations.sort((a, b) => a - b);
    const avgDur = Math.round(streamDurations.reduce((a, b) => a + b, 0) / streamDurations.length);
    console.log(`  ⏱  流平均时长: ${avgDur}ms | 最快: ${streamDurations[0]}ms | 最慢: ${streamDurations[streamDurations.length - 1]}ms`);
  }

  // 错误分析
  if (errors.length > 0) {
    console.log(`\n  错误分析:`);
    const rateLimitErrors = errors.filter((e) => e.status === 429 || (e.body && e.body.includes("rate")));
    const serverErrors = errors.filter((e) => e.status >= 500);
    const otherErrors = errors.filter((e) => !rateLimitErrors.includes(e) && !serverErrors.includes(e));

    if (rateLimitErrors.length > 0) {
      console.log(`  🔴 频率限制 (429): ${rateLimitErrors.length} 次 — DeepSeek RPM/TPM 不够！`);
    }
    if (serverErrors.length > 0) {
      console.log(`  🔴 服务器错误 (5xx): ${serverErrors.length} 次`);
    }
    if (otherErrors.length > 0) {
      console.log(`  🟡 其他错误: ${otherErrors.length} 次`);
    }
  }

  // 结论
  console.log("\n═══════════════════════════════════════════");
  console.log("  测试结论");
  console.log("═══════════════════════════════════════════");

  if (totalErrors === 0 && totalTimeout === 0) {
    console.log(`  ✅ ${concurrency} 并发全部成功！DeepSeek 和服务器表现良好`);
    console.log(`  → 可以尝试增加并发数: node load-test/deepseek-concurrency.js ${concurrency + 5}`);
  } else {
    const errorRate = ((totalErrors + totalTimeout) / totalStarted) * 100;
    console.log(`  错误率: ${errorRate.toFixed(1)}%`);

    if (errors.some((e) => e.status === 429)) {
      console.log(`  🔴 触发 DeepSeek 频率限制`);
      console.log(`  → 建议联系 DeepSeek 提升 API 配额`);
      console.log(`  → 或在代码中添加请求队列/限流`);
    }
  }
}

main().catch((e) => {
  console.error("压测脚本异常:", e);
  process.exit(1);
});
