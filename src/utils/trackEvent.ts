import { supabase } from "@/components/SupabaseProvider";

// 事件队列（批量上报，减少请求次数）
let eventQueue: { event_type: string; session_id?: string; metadata?: any }[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// 上报事件（异步，不阻塞主流程）
export function trackEvent(eventType: string, sessionId?: string, metadata?: any) {
  eventQueue.push({ event_type: eventType, session_id: sessionId, metadata });

  // 3秒后批量发送
  if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, 3000);
  }
}

// 批量发送事件
async function flushEvents() {
  flushTimer = null;
  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    await fetch("/api/student/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events }),
    });
  } catch {
    // 静默失败，不影响用户体验
  }
}

// 页面关闭时发送剩余事件
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (eventQueue.length > 0) {
      navigator.sendBeacon("/api/student/track", JSON.stringify({ events: eventQueue }));
    }
  });
}
