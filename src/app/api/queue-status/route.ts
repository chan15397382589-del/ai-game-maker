import { NextRequest, NextResponse } from "next/server";
import { chatQueue } from "@/lib/requestQueue";
import { getVerifiedAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const admin = await getVerifiedAdmin(token);
  if (admin instanceof NextResponse) return admin;

  const status = chatQueue.getStatus();
  return NextResponse.json(status);
}
