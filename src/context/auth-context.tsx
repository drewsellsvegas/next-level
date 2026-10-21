"use client";

import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import type { AppConfig, MemberStatus, Role, UserDoc } from "@/types";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /**
   * The workspace owner's uid (the first signup). All Firestore writes set
   * `ownerId = adminUid` so that admin + collaborators see the same data.
   * `null` means appConfig hasn't been initialized yet (no admin claimed).
   */
  adminUid: string | null;
  role: Role | null;
  status: MemberStatus | null;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<MemberStatus | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      async (firebaseUser) => {
        setUser(firebaseUser);

        if (!firebaseUser) {
          setAdminUid(null);
          setRole(null);
          setStatus(null);
          setLoading(false);
          return;
        }

        try {
          const db = getFirebaseDb();
          const [cfgSnap, userSnap] = await Promise.all([
            getDoc(doc(db, "appConfig", "main")),
            getDoc(doc(db, "users", firebaseUser.uid)),
          ]);

          const cfg = cfgSnap.exists()
            ? (cfgSnap.data() as AppConfig)
            : null;
          const userDoc = userSnap.exists()
            ? (userSnap.data() as UserDoc)
            : null;

          // Force a fresh ID token so any newly-set custom claims propagate
          // to the session cookie + downstream API routes.
          await firebaseUser.getIdToken(true).catch(() => undefined);

          if (!userDoc || userDoc.status !== "active") {
            // Removed/orphan user — sign them out hard.
            await signOutUser().catch(() => undefined);
            setAdminUid(null);
            setRole(null);
            setStatus("removed");
            setUser(null);
            if (typeof window !== "undefined") {
              window.location.href = "/login?reason=removed";
            }
            return;
          }

          setAdminUid(cfg?.adminUid ?? null);
          setRole(userDoc.role);
          setStatus(userDoc.status);
        } catch (err) {
          console.error("Failed to load auth context", err);
        } finally {
          setLoading(false);
        }
      },
    );

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, adminUid, role, status }}
    >
      {children}
    </AuthContext.Provider>
  );
}
