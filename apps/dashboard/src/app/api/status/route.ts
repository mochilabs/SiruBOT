import { NextResponse } from "next/server";

export async function GET() {
  const shardMode = !!process.env.SHARD_MANAGER_URL || !!process.env.SHARD_MODE;
  return NextResponse.json({ shardMode });
}
