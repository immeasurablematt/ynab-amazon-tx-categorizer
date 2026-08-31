import { cookies } from "next/headers";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function getSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("authjs.session-token")?.value;
  if (!sessionToken) return null;

  const db = getDb();
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.sessionToken, sessionToken),
      gt(sessions.expires, new Date()),
    ),
  });
  if (!session) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  if (!user) return null;

  return { user: { id: user.id, name: user.name, email: user.email } };
}
