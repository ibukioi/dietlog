import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./auth";

export interface CurrentUser {
  id: string;
  name: string;
  isAnonymous: boolean;
  guestExpiresAt: Date | null;
}

/** 1 リクエスト内でセッション取得を共有する(Data Access Layer) */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    isAnonymous?: boolean | null;
    guestExpiresAt?: Date | string | null;
  };
  return {
    id: u.id,
    name: u.name,
    isAnonymous: Boolean(u.isAnonymous),
    guestExpiresAt: u.guestExpiresAt ? new Date(u.guestExpiresAt) : null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}
