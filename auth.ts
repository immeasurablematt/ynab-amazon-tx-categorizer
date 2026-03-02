import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

const db = getDb();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
  }),
  providers: [
    {
      id: "ynab",
      name: "YNAB",
      type: "oauth",
      authorization: {
        url: "https://app.ynab.com/oauth/authorize",
        params: { response_type: "code" },
      },
      token: "https://app.ynab.com/oauth/token",
      checks: ["state"],
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      userinfo: {
        url: "https://api.ynab.com/v1/user",
      },
      profile(profile) {
        return {
          id: profile.data.user.id,
          name: `YNAB User ${profile.data.user.id.slice(0, 8)}`,
        };
      },
      clientId: process.env.YNAB_CLIENT_ID,
      clientSecret: process.env.YNAB_CLIENT_SECRET,
    },
  ],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});
