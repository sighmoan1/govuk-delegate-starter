import type { Metadata } from "next";
import Link from "next/link";
import "./observatory.css";

export const metadata: Metadata = {
  title: "Observatory – independent research prototype",
  description: "Independent research into agent activity, sensor coverage and experimental classification. No operational authority.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en-GB">
    <head><link rel="stylesheet" href="/design.css" /></head>
    <body>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="service-header">
        <div className="width-container service-header__inner">
          <Link className="brand-link" href="/"><span className="brand-name">Observatory<span className="brand-dot">.</span></span></Link>
        </div>
      </header>
      <div className="width-container"><p className="phase-banner">Independent research prototype — not an official GOV.UK service.</p><main id="main-content" className="main-wrapper">{children}</main></div>
      <footer className="service-footer"><div className="width-container">
        <p className="small">Independent research prototype. Not an official GOV.UK service. Synthetic data only at this stage.</p>
      </div></footer>
    </body>
  </html>;
}
