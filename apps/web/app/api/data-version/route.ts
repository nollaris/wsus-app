import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  checkAndUpdateServerDataVersion,
  getDataVersion,
} from "@/lib/data-version";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const version = await getDataVersion();
  const changed = checkAndUpdateServerDataVersion(version);

  if (changed) {
    // Lazily invalidate Next.js route cache only when new data is detected
    revalidatePath("/", "layout");
  }

  return NextResponse.json(
    { version, changed },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
