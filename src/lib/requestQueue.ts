// API 请求队列 - 解决并发限流问题
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent: number;
  private delayBetween: number;

  constructor(maxConcurrent = 5, delayBetween = 1000) {
    this.maxConcurrent = maxConcurrent;
    this.delayBetween = delayBetween;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift()!;

    try {
      await task();
    } finally {
      this.running--;
      // 添加延迟避免瞬间大量请求
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, this.delayBetween));
      }
      this.processQueue();
    }
  }
}

// 全局队列实例：最多 5 个并发请求，每个请求间隔 1 秒
export const chatQueue = new RequestQueue(5, 1000);
