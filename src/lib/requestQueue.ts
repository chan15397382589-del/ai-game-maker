// API 请求队列 - 解决并发限流问题
class RequestQueue {
  private queue: Array<{ id: string; fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];
  private running = 0;
  private maxConcurrent: number;
  private delayBetween: number;

  constructor(maxConcurrent = 10, delayBetween = 500) {
    this.maxConcurrent = maxConcurrent;
    this.delayBetween = delayBetween;
  }

  // 获取队列状态
  getStatus() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent,
    };
  }

  // 获取某人在队列中的位置（从1开始）
  getQueuePosition(id: string): number {
    const idx = this.queue.findIndex(item => item.id === id);
    return idx === -1 ? -1 : idx + 1;
  }

  async add<T>(fn: () => Promise<T>, id?: string): Promise<T> {
    const itemId = id || Math.random().toString(36).substring(7);

    return new Promise((resolve, reject) => {
      this.queue.push({ id: itemId, fn, resolve, reject });
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
      const result = await task.fn();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
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

// 全局队列实例：最多 10 个并发请求，每个请求间隔 500ms
export const chatQueue = new RequestQueue(10, 500);
