import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Provide a valid email address." },
      { status: 400 },
    );
  }

  const adminAuth = getAdminAuth();
  try {
    const existing = await adminAuth.getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account already exists for this email." },
        { status: 409 },
      );
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }

  const db = getAdminDb();
  await db.doc(`invites/${email}`).set({
    email,
    invitedByUid: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    acceptedByUid: null,
    acceptedAt: null,
  });

  return NextResponse.json({ ok: true, email });
}
