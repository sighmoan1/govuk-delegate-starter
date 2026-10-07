import type { Metadata } from "next";
import Link from "next/link";
import "./hmrc.css";
import { config } from "@/lib/config";
import { currentTaxpayer } from "@/lib/session";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: { default: "Claim tax relief for working from home (demo)", template: "%s – HMRC demo service" },
  description: "A mock HMRC service built for the GOV.UK Delegate prototype. Not HMRC. Synthetic data only.",
};
export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/your-tax", label: "Your tax" },
  { href: "/ops", label: "Operations view" },
];

export default async function HmrcLayout({ children }: { children: React.ReactNode }) {
  const taxpayer = await currentTaxpayer();
  return (
    <html lang="en-GB">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/design.css" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="service-header hmrc-header">
          <div className="width-container service-header__inner">
            <Link className="brand-link" href="/">
              <span className="brand-name">Tax relief for working from home</span>
            </Link>
            <Nav links={LINKS} label="Service" />
          </div>
        </header>
        <div className="width-container">
          <div className="phase-banner">
            <strong className="tag tag--mock">Mock service</strong>
            <span className="small">
              A stand-in for an HMRC service, built for the GOV.UK Delegate prototype. It is not HMRC and holds only synthetic data. It signs
              people in with the GOV.UK One Login simulator.
            </span>
          </div>
        </div>
        <div className="width-container">
          <main id="main-content" className="main-wrapper">
            {taxpayer && (
              <div className="signin-state">
                Signed in as {taxpayer.name}.{" "}
                <form action="/auth/logout" method="post">
                  <button className="link-button" type="submit">Sign out</button>
                </form>
              </div>
            )}
            {children}
          </main>
        </div>
        <footer className="service-footer">
          <div className="width-container">
            <ul className="footer-links">
              <li><a href={config.delegateUrl}>GOV.UK Delegate (prototype home)</a></li>
              <li><a href={`${config.delegateUrl}/account/delegates`}>Who can act for you</a></li>
              <li><a href={config.agentUrl}>Example AI (demo agent)</a></li>
              <li><Link href="/ops">Operations view</Link></li>
            </ul>
            <p className="small">Part of an independent prototype. Synthetic data only. No production security, accreditation or official status is claimed.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
