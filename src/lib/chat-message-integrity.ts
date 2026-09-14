export interface MessageWriteRetryOptions {
  context: string;
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * 将一次逻辑写入收敛为同一个Promise。超时回调与正常流结束可能在同一时刻触发，
 * 所有并发调用必须复用首次写入，避免同一轮AI回复被重复插入。
 */
export function createSingleFlightWrite<TArgs extends unknown[]>(
  write: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
  let writePromise: Promise<void> | null = null;

  return (...args: TArgs) => {
    if (!writePromise) writePromise = Promise.resolve().then(() => write(...args));
    return writePromise;
  };
}

/**
 * 对数据库消息写入执行有限重试。重试耗尽后必须抛错，禁止把消息丢失伪装成成功。
 */
export async function runMessageWriteWithRetry(
  write: () => Promise<void>,
  options: MessageWriteRetryOptions,
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 1_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await write();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || "未知错误");
  throw new Error(`${options.context}保存失败：经过${maxAttempts}次尝试仍未成功；${detail}`);
}

/**
 * AI生成失败时保留可审计记录；若已经收到部分正文，必须完整保留部分正文和HTML代码。
 * reason只接受调用方提供的公开分类，不写入供应商错误堆栈或密钥等敏感信息。
 */
export function formatAssistantFailureRecord(reason: string, partialContent = ""): string {
  const marker = `【系统记录：${reason}；本轮没有形成完整AI回复】`;
  return partialContent ? `${partialContent}\n\n${marker}` : marker;
}
