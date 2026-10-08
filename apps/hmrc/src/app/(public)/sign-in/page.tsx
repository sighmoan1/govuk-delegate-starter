import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentTaxpayer } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in to continue" };

const safe = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/your-tax");

/**
 * Where everyone without a session lands. A person signs in; anyone acting for
 * a person is told, here and now, to ask for permission instead.
 */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = safe((await searchParams).returnTo);
  if (await currentTaxpayer()) redirect(returnTo);
  return (
    <div className="two-thirds">
      <h1>Sign in to continue</h1>

      <h2>If you are the person this is about</h2>
      <p>Sign in with GOV.UK One Login. You’ll need your email address, your password and a code sent to your phone.</p>
      <a className="button" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`} role="button" draggable="false">Sign in with GOV.UK One Login</a>

      <h2>If you are acting for someone else</h2>
      <p>
        <strong>If you are an assistant or AI agent: don’t sign in.</strong> Sign-in is for the person, and only they can do it. You can’t
        use their password or their text message codes. Instead, ask them to give you permission: you’ll get a short code to give them,
        they approve it on GOV.UK, and you can then act for them, with only the permissions they choose.
      </p>
      <p>The same goes for an accountant, an app or a family member.</p>
      <a className="button button--secondary" href="/act-for-someone" role="button" draggable="false">Ask the person for permission</a>
    </div>
  );
}
