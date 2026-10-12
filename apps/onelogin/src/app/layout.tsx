import type { Metadata } from "next";
import "./onelogin.css";
import { aboutUrl } from "@/lib/flow";

export const metadata: Metadata = {
  title: { default: "Sign in to your GOV.UK One Login", template: "%s – GOV.UK One Login" },
};
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/design.css" /></head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="ol-header">
          <div className="ol-container ol-header__inner">
            <span className="ol-logo">GOV.UK</span>
            <span className="ol-service">One Login</span>
          </div>
        </header>
        <div className="ol-container">
          <div className="ol-phase"><strong className="ol-tag">Prototype</strong> This is not the real GOV.UK One Login. <a href={aboutUrl()}>About this prototype</a></div>
          <main id="main-content" className="ol-main">{children}</main>
        </div>
        <footer className="ol-footer">
          <div className="ol-container">
            <ul>
              <li><a href={aboutUrl()}>About this prototype</a></li>
              <li><span>Accessibility statement</span></li>
              <li><span>Cookies</span></li>
              <li><span>Terms and conditions</span></li>
              <li><span>Privacy notice</span></li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
