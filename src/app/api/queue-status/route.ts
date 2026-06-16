import { NextResponse } from "next/server";
import { chatQueue } from "@/lib/requestQueue";

export async function GET() {
  const status = chatQueue.getStatus();
  return NextResponse.json(status);
}
