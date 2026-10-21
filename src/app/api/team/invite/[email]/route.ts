import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  await getAdminDb().doc(`invites/${email}`).delete();
  return NextResponse.json({ ok: true });
}
