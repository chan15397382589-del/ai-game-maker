"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/components/SupabaseProvider";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      // 查用户角色，跳转到对应页面
      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (userData?.role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/student");
      }
    };

    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="text-center">
        <p className="text-lg text-gray-500 animate-pulse">正在跳转...</p>
      </div>
    </div>
  );
}
