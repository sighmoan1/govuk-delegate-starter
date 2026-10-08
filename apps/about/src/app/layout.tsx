import type { Metadata } from "next";
import Link from "next/link";
import "./about.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: { default: "About the GOV.UK Delegate prototype", template: "%s – GOV.UK Delegate prototype" },
  description: "An independent prototype: delegating authority to agents through GOV.UK, and what that lets government do about automated traffic.",
};

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/use-an-agent", label: "1. Use an agent" },
  { href: "/manage-who-can-act", label: "2. Manage who can act" },
  { href: "/prioritise-trusted-traffic", label: "3. Prioritise trusted traffic" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/why", label: "Why" },
  { href: "/precedents", label: "Precedents" },
  { href: "/sams-phone", label: "Sam’s phone" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/design.css" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="service-header about-header">
          <div className="width-container service-header__inner">
            <Link className="brand-link" href="/">
              <span className="brand-name">Delegate<span className="brand-dot">.</span> <span className="about-sub">prototype notes</span></span>
            </Link>
          </div>
        </header>
        <div className="width-container">
          <Nav links={LINKS} />
        </div>
        <div className="width-container">
          <main id="main-content" className="main-wrapper">{children}</main>
        </div>
        <footer className="service-footer">
          <div className="width-container">
            <p className="small">
              An independent prototype. Not an official GOV.UK, HMRC or One Login service. Synthetic data only. No production security,
              accreditation or official status is claimed.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
