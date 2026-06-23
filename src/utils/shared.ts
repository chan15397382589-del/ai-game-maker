import { supabase } from "@/components/SupabaseProvider";

// 获取认证 token
export async function getAuthToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch {
    return "";
  }
}

// 清理 Supabase 本地存储中的过期数据
export function clearStaleStorage() {
  if (typeof window === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) {
            localStorage.removeItem(key);
          }
        }
      }
    }
  } catch {}
}

// 提取 HTML 代码块
export function extractHtmlCode(content: string): string {
  // 1. 匹配 ```html ... ```
  const htmlFence = /```html\s*\n([\s\S]*?)```/gi;
  const allMatches: string[] = [];
  let m;
  while ((m = htmlFence.exec(content)) !== null) {
    if (m[1].trim().length > 50) allMatches.push(m[1].trim());
  }
  if (allMatches.length > 0) {
    allMatches.sort((a, b) => b.length - a.length);
    return allMatches[0];
  }

  // 2. 匹配 ``` ... ``` (包含 HTML 标签)
  const anyFence = /```\s*\n([\s\S]*?)```/g;
  while ((m = anyFence.exec(content)) !== null) {
    if (m[1].includes("<") && m[1].trim().length > 50) return m[1].trim();
  }

  // 3. 匹配 DOCTYPE
  const doctype = content.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (doctype) return doctype[0].trim();

  return "";
}
