import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in to continue" };

// One plain sentence before the visitor meets the simulator's developer form.
export default async function ConsentSignin({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo = "/account/delegates" } = await searchParams;
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account/delegates";
  return (
    <div className="two-thirds">
      <h1>Sign in with GOV.UK One Login</h1>
      <p>To decide who can act for you, GOV.UK needs to know it’s you.</p>
      <div className="inset-text">
        <p>
          This prototype uses the <strong>GOV.UK One Login simulator</strong>, a test tool, not the real sign-in. It shows a form full of test
          details. Just press <strong>Continue</strong> at the bottom to sign in as Sam.
        </p>
      </div>
      <a className="button" href={`/auth/login?returnTo=${encodeURIComponent(safe)}`} role="button" draggable="false">Continue to sign in</a>
    </div>
  );
}
