import type { Metadata } from "next";
import "./delegate.css";

export const metadata: Metadata = {
  title: { default: "GOV.UK Delegate (prototype)", template: "%s – GOV.UK Delegate prototype" },
  description: "Independent prototype exploring scoped, revocable delegation to AI agents. Not an official GOV.UK service.",
};

export const dynamic = "force-dynamic";

// Three surfaces share this shell: the agent's own app (/example-ai), GOV.UK
// (consent and account settings) and the HMRC team's internal view. Each has its
// own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/design.css" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
