import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In - Amazon to YNAB",
  description: "Connect your YNAB account to start importing Amazon purchases.",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <Link href="/" className="text-xl font-bold text-slate-100 no-underline">
          Amazon&rarr;YNAB
        </Link>
        <Link href="/pricing" className="text-sm text-slate-300 hover:text-slate-100 no-underline">
          Pricing
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 sm:p-10 max-w-md w-full text-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3">Connect with YNAB</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Sign in with your YNAB account to get started. We&rsquo;ll use
            OAuth&mdash;your password is never shared with us.
          </p>

          <form
            action={async () => {
              "use server";
              // Build YNAB OAuth URL manually to avoid NextAuth injecting scope
              const state = crypto.randomUUID();
              const cookieStore = await cookies();
              cookieStore.set("ynab-oauth-state", state, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 600,
                path: "/",
              });

              const params = new URLSearchParams({
                response_type: "code",
                client_id: process.env.YNAB_CLIENT_ID!,
                redirect_uri: `${process.env.AUTH_URL || "http://localhost:3000"}/api/auth/callback/ynab`,
                state,
              });

              redirect(`https://app.ynab.com/oauth/authorize?${params.toString()}`);
            }}
          >
            <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg py-4 rounded-xl transition-colors cursor-pointer"
            >
              Connect with YNAB
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-6 leading-relaxed">
            By signing in, you agree to our{" "}
            <Link href="/privacy" className="text-slate-400 underline">Privacy Policy</Link>{" "}
            and{" "}
            <Link href="/terms" className="text-slate-400 underline">Terms of Service</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
