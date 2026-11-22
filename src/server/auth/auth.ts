import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins/anonymous";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { transferUserData } from "@/server/repositories/account";

const github =
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
    : undefined;

export const isGithubEnabled = Boolean(github);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    additionalFields: {
      guestExpiresAt: { type: "date", required: false, input: false },
    },
  },
  // 本登録は GitHub OAuth のみ(§1.1)。メール/パスワードは使わない
  emailAndPassword: { enabled: false },
  socialProviders: github,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    anonymous({
      emailDomainName: "guest.dietlog.invalid",
      generateName: () => "お試しユーザー",
      // お試しユーザーが GitHub で本登録したら、記録を新しいユーザーへ引き継ぐ
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await transferUserData(db, anonymousUser.user.id, newUser.user.id);
        await db.update(schema.user).set({ guestExpiresAt: null }).where(eq(schema.user.id, newUser.user.id));
      },
    }),
    nextCookies(), // Server Action から Cookie を設定するため最後に置く
  ],
});

export type Session = typeof auth.$Infer.Session;
