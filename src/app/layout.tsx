import type { Metadata } from "next";
import Link from "next/link";
import "./delegate.css";
import { currentPrincipal } from "@/lib/session";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: { default: "GOV.UK Delegate (prototype)", template: "%s – GOV.UK Delegate prototype" },
  description: "Independent prototype exploring scoped, revocable delegation to software agents. Not an official GOV.UK service.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const principal = await currentPrincipal();
  return (
    <html lang="en-GB">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/design.css" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="service-header">
          <div className="width-container service-header__inner">
            <Link className="brand-link" href="/">
              <span className="brand-name">Delegate<span className="brand-dot">.</span></span>
            </Link>
            <Nav />
          </div>
        </header>
        <div className="width-container">
          <div className="phase-banner">
            <strong className="tag">Prototype</strong>
            <span className="small">
              An independent prototype using synthetic data. It is not an official GOV.UK service and is not connected to GOV.UK One Login or DWP.
            </span>
          </div>
        </div>
        <div className="width-container">
          <main id="main-content" className="main-wrapper">
            {principal && (
              <div className="signin-state">
                Signed in as {principal.displayName}.{" "}
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
              <li><Link href="/about">About this project</Link></li>
              <li><Link href="/activity">Agent activity</Link></li>
              <li><Link href="/agent">Demo Personal Agent</Link></li>
            </ul>
            <p className="small">Independent prototype. Synthetic data only. No production security, accreditation or official GOV.UK status is claimed.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
