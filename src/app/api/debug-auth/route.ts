import { NextResponse } from "next/server";

// 诊断接口：测试 service role key 是否正常工作
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const results: Record<string, any> = {
    supabaseUrl,
    serviceKeyPrefix: serviceKey?.substring(0, 20) + "...",
    serviceKeySuffix: serviceKey?.slice(-10),
    anonKeyPrefix: anonKey?.substring(0, 20) + "...",
  };

  // 测试1: 用 service role key 直接 fetch
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users?select=id,name,role&limit=5`, {
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    results.fetchWithServiceKey = {
      status: res.status,
      statusText: res.statusText,
      data: await res.json(),
    };
  } catch (e: any) {
    results.fetchWithServiceKey = { error: e.message };
  }

  // 测试2: 用 anon key fetch（应该被 RLS 限制）
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users?select=id,name,role&limit=5`, {
      headers: {
        apikey: anonKey!,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    results.fetchWithAnonKey = {
      status: res.status,
      statusText: res.statusText,
      data: await res.json(),
    };
  } catch (e: any) {
    results.fetchWithAnonKey = { error: e.message };
  }

  // 测试3: 用 service role key 的 JS client
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(supabaseUrl!, serviceKey!);
    const { data, error } = await client.from("users").select("id,name,role").limit(5);
    results.jsClientWithServiceKey = { data, error };
  } catch (e: any) {
    results.jsClientWithServiceKey = { error: e.message };
  }

  return NextResponse.json(results);
}
