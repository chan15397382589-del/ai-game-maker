/**
 * Supabase 并发性能测试
 * 模拟 50 名学生同时请求管理后台 API，测试 Supabase 连接池和响应时间
 *
 * 用法: node load-test/supabase-concurrency.js
 *
 * 这个脚本只测试 Supabase API（不消耗 DeepSeek 配额）
 */

const CONCURRENT_USERS = 50;
const BASE_URL = "http://localhost:3000";

// 统计
let totalRequests = 0;
let successCount = 0;
let errorCount = 0;
const responseTimes = [];
const errors = [];

async function getAuthToken() {
  // 用测试学生账号登录获取 token
  const res = await fetch(`${BASE_URL}/api/debug-auth`);
  return null; // debug-auth 不需要 token
}

async function testSingleRequest(id) {
  const start = Date.now();
  try {
    // 测试 debug-auth 接口（验证 Supabase 连接）
    const res = await fetch(`${BASE_URL}/api/debug-auth`, {
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - start;
    responseTimes.push(elapsed);

    if (res.ok) {
      const data = await res.json();
      successCount++;
      return { id, ok: true, elapsed, status: data.status };
    } else {
      errorCount++;
      errors.push({ id, status: res.status, elapsed });
      return { id, ok: false, elapsed, status: res.status };
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    errorCount++;
    responseTimes.push(elapsed);
    errors.push({ id, error: err.message, elapsed });
    return { id, ok: false, elapsed, error: err.message };
  } finally {
    totalRequests++;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Supabase 并发性能测试");
  console.log("═══════════════════════════════════════════");
  console.log(`  目标: ${BASE_URL}/api/debug-auth`);
  console.log(`  并发数: ${CONCURRENT_USERS} 个请求`);
  console.log(`  测试 Supabase 连接池承受能力\n`);

  // 先发 1 个请求确认服务正常
  console.log("[预热] 发送单个请求确认服务状态...");
  const warmup = await testSingleRequest("warmup");
  console.log(`[预热] 状态: ${warmup.ok ? "✅ 正常" : "❌ 异常"} (${warmup.elapsed}ms)\n`);

  // 重置统计
  totalRequests = 0;
  successCount = 0;
  errorCount = 0;
  responseTimes.length = 0;
  errors.length = 0;

  // ─── 第 1 轮：逐步递增并发 ───
  console.log("───────────────────────────────────────────");
  console.log("  第1轮：逐步递增（10→20→30→40→50）");
  console.log("───────────────────────────────────────────\n");

  const rounds = [10, 20, 30, 40, 50];
  for (const n of rounds) {
    totalRequests = 0;
    successCount = 0;
    errorCount = 0;
    responseTimes.length = 0;
    errors.length = 0;

    console.log(`\n>>> ${n} 并发请求中...`);
    const startTime = Date.now();

    const tasks = [];
    for (let i = 0; i < n; i++) {
      tasks.push(testSingleRequest(`round1-${n}-${i}`));
    }
    await Promise.all(tasks);

    const totalTime = Date.now() - startTime;

    // 统计
    responseTimes.sort((a, b) => a - b);
    const avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
    const min = responseTimes[0];
    const max = responseTimes[responseTimes.length - 1];

    console.log(`  ✅ 成功: ${successCount}/${n}`);
    if (errorCount > 0) {
      console.log(`  ❌ 失败: ${errorCount}/${n}`);
      errors.slice(0, 3).forEach((e) => console.log(`     ${JSON.stringify(e)}`));
    }
    console.log(`  ⏱  总耗时: ${totalTime}ms`);
    console.log(`  ⏱  平均响应: ${avg}ms | P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);
    console.log(`  ⏱  最快: ${min}ms | 最慢: ${max}ms`);

    // 冷却一下
    await sleep(1000);
  }

  // ─── 第 2 轮：瞬时峰值（全部 50 个同时） ───
  console.log("\n───────────────────────────────────────────");
  console.log("  第2轮：瞬时峰值（50个完全同时）");
  console.log("───────────────────────────────────────────\n");

  totalRequests = 0;
  successCount = 0;
  errorCount = 0;
  responseTimes.length = 0;
  errors.length = 0;

  console.log(`>>> 50 并发请求中...`);
  const peakStart = Date.now();

  const peakTasks = [];
  for (let i = 0; i < 50; i++) {
    peakTasks.push(testSingleRequest(`peak-${i}`));
  }
  await Promise.all(peakTasks);

  const peakTotal = Date.now() - peakStart;
  responseTimes.sort((a, b) => a - b);

  const peakAvg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
  const peakP50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
  const peakP95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
  const peakP99 = responseTimes[Math.floor(responseTimes.length * 0.99)];

  console.log(`  ✅ 成功: ${successCount}/${50}`);
  console.log(`  ❌ 失败: ${errorCount}/${50}`);
  if (errors.length > 0) {
    console.log(`  失败详情（前5条）:`);
    errors.slice(0, 5).forEach((e) => console.log(`     ${JSON.stringify(e)}`));
  }
  console.log(`  ⏱  总耗时: ${peakTotal}ms`);
  console.log(`  ⏱  平均响应: ${peakAvg}ms | P50: ${peakP50}ms | P95: ${peakP95}ms | P99: ${peakP99}ms`);

  // ─── 结论 ───
  console.log("\n═══════════════════════════════════════════");
  console.log("  测试结论");
  console.log("═══════════════════════════════════════════");

  const errorRate = (errorCount / totalRequests) * 100;
  if (errorCount === 0) {
    console.log("  ✅ Supabase 连接池：50并发无故障");
  } else if (errorRate < 5) {
    console.log(`  ⚠️  错误率 ${errorRate.toFixed(1)}%，勉强可用`);
  } else {
    console.log(`  ❌ 错误率 ${errorRate.toFixed(1)}%，需要优化连接池`);
  }

  if (peakP95 > 5000) {
    console.log(`  ⚠️  P95 延迟 ${peakP95}ms，响应偏慢`);
  } else {
    console.log(`  ✅ P95 延迟 ${peakP95}ms，响应速度可接受`);
  }

  console.log(`\n  压测完成！请根据以上数据判断是否需要:`);
  console.log(`  - 增加 Supabase 数据库连接池大小`);
  console.log(`  - 添加 Redis 缓存层`);
  console.log(`  - 使用 Supabase Connection Pooler`);
}

main().catch((e) => {
  console.error("压测脚本异常:", e);
  process.exit(1);
});
