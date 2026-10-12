import type { Metadata } from "next";
import designSystem from "../../../../bathos-design-system.json";
import "./delegate.css";

export const metadata: Metadata = {
  title: { default: "Your GOV.UK account", template: "%s – GOV.UK" },
  description: "Manage who can act for you with government services.",
};

export const dynamic = "force-dynamic";

// Three surfaces share this shell: GOV.UK
// (consent and account settings) and the HMRC team's internal view. Each has its
// own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-bathos-palette={designSystem.palette}>
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
