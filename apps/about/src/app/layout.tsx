import type { Metadata } from "next";
import Link from "next/link";
import { delegateNavigationFromEnv } from "@prototype/connected-navigation";
import { ConnectedNavigation } from "@prototype/connected-navigation/react";
import "./about.css";
import { Nav } from "./nav";
import { publicBriefingMode } from "@/lib/public-briefing";

// Resolve the instance mode and service URLs at request time, not Docker build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "About the Delegate prototype", template: "%s – Delegate prototype" },
  description: "An independent prototype: delegating authority to agents through GOV.UK, and what that lets government do about automated traffic.",
};

const PUBLIC_LINKS = [
  { href: "/briefing", label: "Briefings" },
  { href: "/briefing/high-level", label: "Concept" },
  { href: "/briefing/detailed", label: "Design review" },
  { href: "/briefing/demo", label: "Demonstration guide" },
];

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/ask-your-agent", label: "Ask your agent" },
  { href: "/manage-who-can-act", label: "1. Manage who can act" },
  { href: "/prioritise-trusted-traffic", label: "2. Prioritise trusted traffic" },
  { href: "/which-route", label: "3. Which route?" },
  { href: "/swarm", label: "4. Can a swarm win?" },
  { href: "/project-status", label: "Project status" },
  { href: "/evidence", label: "Evidence & experiments" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/delegate-orchestrate", label: "Delegate or Orchestrate?" },
  { href: "/why", label: "Why" },
  { href: "/precedents", label: "Precedents" },
  { href: "/sams-phone", label: "Sam’s phone" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const briefingMode = publicBriefingMode();
  const connectedLinks = delegateNavigationFromEnv(process.env, { mode: briefingMode ? "public" : "private" });
  return (
    <html lang="en-GB">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/design.css" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/connected-navigation.css" />
        <script src="/connected-navigation.js" defer />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="service-header about-header">
          <div className="width-container service-header__inner">
            <Link className="brand-link" href="/">
              <span className="brand-name">Delegate<span className="brand-dot">.</span> <span className="about-sub">prototype notes</span></span>
            </Link>
            <ConnectedNavigation links={connectedLinks} activeId="about" id="about-connected-navigation" />
          </div>
        </header>
        <div className="width-container">
          <Nav links={briefingMode ? PUBLIC_LINKS : LINKS} />
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
