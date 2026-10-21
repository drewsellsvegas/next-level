import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }
  if (uid === auth.uid) {
    return NextResponse.json(
      { error: "Admins cannot remove themselves." },
      { status: 400 },
    );
  }

  const adminAuth = getAdminAuth();
  const db = getAdminDb();

  const target = await adminAuth.getUser(uid).catch(() => null);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const claims = (target.customClaims ?? {}) as { role?: string };
  if (claims.role === "admin") {
    return NextResponse.json(
      { error: "Cannot remove the workspace admin." },
      { status: 400 },
    );
  }

  // Flip claim → status: removed. Their next request fails the rules `isActive`
  // check, and the AuthContext's force-signout catches them on the client.
  await adminAuth.setCustomUserClaims(uid, {
    role: "collaborator",
    status: "removed",
  });
  await adminAuth.updateUser(uid, { disabled: true }).catch(() => undefined);
  await db.doc(`users/${uid}`).update({
    status: "removed",
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Also clear the invite so the email can be re-invited later if needed.
  if (target.email) {
    await db
      .doc(`invites/${target.email.toLowerCase()}`)
      .delete()
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
