export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "inactive";

export type Role = "admin" | "collaborator";

export type MemberStatus = "active" | "removed";

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPriceId: string | null;
  role: Role;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppConfig {
  adminUid: string;
  adminEmail: string;
  createdAt: Date;
}

export interface InviteDoc {
  email: string;
  invitedByUid: string;
  createdAt: Date;
  acceptedByUid: string | null;
  acceptedAt: Date | null;
}
