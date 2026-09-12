interface RetryOptions {
  context: string;
  maxAttempts?: number;
  delayMs?: number;
}

const TRANSIENT_ERROR_PATTERN =
  /gateway timeout|bad gateway|service unavailable|upstream|timeout|timed out|fetch failed|network|socket|econnreset|etimedout|\b502\b|\b503\b|\b504\b/i;

function errorDetails(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    return [candidate.message, candidate.details, candidate.hint, candidate.code, candidate.status]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .map(String)
      .join(" | ");
  }
  return String(error);
}

function isTransientError(error: unknown): boolean {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const status = Number(candidate?.status ?? candidate?.statusCode);
  if ([502, 503, 504].includes(status)) return true;
  return TRANSIENT_ERROR_PATTERN.test(errorDetails(error));
}

export async function runWithTransientRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 750);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const details = errorDetails(error);
      const canRetry = attempt < maxAttempts && isTransientError(error);
      if (!canRetry) {
        const attempts = attempt > 1 ? `（${attempt}次尝试后）` : "";
        throw new Error(`${options.context}${attempts}: ${details}`);
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1)));
      }
    }
  }

  throw new Error(`${options.context}: 查询失败`);
}
