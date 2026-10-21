import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { Role } from "@/types";

interface SignupBody {
  email?: string;
  password?: string;
  displayName?: string;
}

type Decision =
  | { kind: "admin" }
  | { kind: "collaborator"; adminUid: string };

export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const displayName = body.displayName?.trim() || email?.split("@")[0] || "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const auth = getAdminAuth();

  // Phase 1 — gate decision in a transaction. Either claim the admin slot
  // (if appConfig/main doesn't exist yet) or consume a pending invite.
  let decision: Decision;
  try {
    decision = await db.runTransaction<Decision>(async (tx) => {
      const cfgSnap = await tx.get(db.doc("appConfig/main"));
      if (!cfgSnap.exists) {
        const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
        if (bootstrap && bootstrap !== email) {
          throw new Error(
            "Only the configured bootstrap admin email may claim this workspace.",
          );
        }
        return { kind: "admin" };
      }
      const inviteSnap = await tx.get(db.doc(`invites/${email}`));
      if (!inviteSnap.exists) {
        throw new Error(
          "This email is not invited. Ask the workspace admin to invite you.",
        );
      }
      const invite = inviteSnap.data();
      if (invite?.acceptedByUid) {
        throw new Error("This invite has already been used.");
      }
      const adminUid = cfgSnap.data()?.adminUid as string | undefined;
      if (!adminUid) {
        throw new Error("Workspace is misconfigured (missing adminUid).");
      }
      return { kind: "collaborator", adminUid };
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Signup not allowed.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  // Phase 2 — create the Firebase Auth user. Done after the gate so we
  // never leave orphan auth users when the gate rejects.
  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password, displayName });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "An account already exists for this email." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not create account.",
      },
      { status: 500 },
    );
  }

  // Phase 3 — set custom claims, write user doc, finalize bootstrap or
  // invite. If anything fails we delete the orphan auth user.
  const role: Role = decision.kind === "admin" ? "admin" : "collaborator";
  const uid = userRecord.uid;

  try {
    await auth.setCustomUserClaims(uid, { role, status: "active" });

    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      uid,
      email,
      displayName,
      photoURL: null,
      stripeCustomerId: null,
      subscriptionStatus: "inactive",
      subscriptionPriceId: null,
      role,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (decision.kind === "admin") {
      batch.set(db.doc("appConfig/main"), {
        adminUid: uid,
        adminEmail: email,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(db.doc(`invites/${email}`), {
        acceptedByUid: uid,
        acceptedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    await auth.deleteUser(uid).catch(() => undefined);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not finalize signup.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ uid, role });
}
