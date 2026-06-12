import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 单例模式：避免每次请求都创建新连接
let _adminClient: SupabaseClient | null = null;

export function getDB(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          fetch: (url, options = {}) => {
            return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
          },
        },
      }
    );
  }
  return _adminClient;
}
