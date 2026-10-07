import { NextResponse } from "next/server";

import { isDashboardAdmin } from "@/lib/admin-ids";
import { auth } from "@/lib/auth";
import { fetchDataApiStatus } from "@/lib/data-api";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDashboardAdmin(session.user.id)) {
    return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  }

  try {
    const data = await fetchDataApiStatus();
    if (!data)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch data-api status:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
