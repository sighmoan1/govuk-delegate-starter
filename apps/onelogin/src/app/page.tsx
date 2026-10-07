import type { Metadata } from "next";

export const metadata: Metadata = { title: "GOV.UK One Login" };

export default function Home() {
  return (
    <div className="ol-narrow">
      <h1>GOV.UK One Login</h1>
      <p>Your GOV.UK One Login lets you sign in to government services with one email address and password.</p>
      <p>To sign in, go to the service you want to use and choose to sign in with GOV.UK One Login.</p>
    </div>
  );
}
