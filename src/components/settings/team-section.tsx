"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Mail, Trash2, UserPlus, Users } from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InviteDoc, UserDoc } from "@/types";

interface PendingInvite extends InviteDoc {
  id: string;
}

interface MemberRow extends UserDoc {
  id: string;
}

export function TeamSection({ currentAdminUid }: { currentAdminUid: string }) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubInvites = onSnapshot(
      query(
        collection(db, "invites"),
        where("acceptedByUid", "==", null),
      ),
      (snap) => {
        setInvites(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<InviteDoc, "id">),
          })),
        );
      },
    );
    const unsubMembers = onSnapshot(
      query(collection(db, "users"), where("status", "==", "active")),
      (snap) => {
        setMembers(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UserDoc, "id">),
          })),
        );
      },
    );
    return () => {
      unsubInvites();
      unsubMembers();
    };
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Couldn't send invite.");
      }
      toast.success(`Invited ${trimmed}. Email them and ask them to sign up.`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send invite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(inviteEmail: string) {
    if (!confirm(`Revoke invite for ${inviteEmail}?`)) return;
    setRemoving(inviteEmail);
    try {
      const res = await fetch(
        `/api/team/invite/${encodeURIComponent(inviteEmail)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Couldn't revoke invite.");
      toast.success("Invite revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke.");
    } finally {
      setRemoving(null);
    }
  }

  async function removeMember(uid: string, displayLabel: string) {
    if (!confirm(`Remove ${displayLabel} from this workspace?`)) return;
    setRemoving(uid);
    try {
      const res = await fetch(`/api/team/member/${uid}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Couldn't remove member.");
      }
      toast.success(`${displayLabel} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove.");
    } finally {
      setRemoving(null);
    }
  }

  const collaborators = members.filter((m) => m.uid !== currentAdminUid);

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Team</h2>
          <p className="text-xs text-muted-foreground">
            Invite collaborators by email. They&apos;ll get full access except
            billing and team management.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px] space-y-1.5">
          <Label htmlFor="invite-email">Invite by email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={submitting || !email.trim()}>
          <UserPlus className="mr-1 h-3.5 w-3.5" />
          {submitting ? "Inviting…" : "Invite"}
        </Button>
      </form>
      <p className="mb-4 text-[11px] text-muted-foreground">
        After inviting, email them yourself and ask them to sign up at{" "}
        <code>/signup</code> with this exact email — they&apos;ll be linked to
        your workspace automatically.
      </p>

      {(invites.length > 0 || collaborators.length > 0) && (
        <div className="space-y-3">
          {collaborators.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Active members
              </p>
              <ul className="space-y-1.5">
                {collaborators.map((m) => (
                  <li
                    key={m.uid}
                    className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {m.displayName || m.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removing === m.uid}
                      onClick={() =>
                        removeMember(m.uid, m.displayName || m.email)
                      }
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pending invites
              </p>
              <ul className="space-y-1.5">
                {invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-dashed bg-background px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{inv.email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removing === inv.email}
                      onClick={() => revokeInvite(inv.email)}
                      className="text-muted-foreground"
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
