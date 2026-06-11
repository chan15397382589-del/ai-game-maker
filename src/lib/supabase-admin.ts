import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 单例模式：避免每次请求都创建新连接
let _adminClient: SupabaseClient | null = null;

export function getDB(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}
