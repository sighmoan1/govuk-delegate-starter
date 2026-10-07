import type { Metadata } from "next";
import "./hmrc.css";

export const metadata: Metadata = {
  title: { default: "Claim tax relief for your job expenses", template: "%s – Claim tax relief for your job expenses – GOV.UK" },
  description: "Claim tax relief for your job expenses, including working from home.",
};
export const dynamic = "force-dynamic";

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
