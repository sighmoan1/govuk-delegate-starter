import Link from "next/link";
import { delegateNavigationFromEnv } from "@prototype/connected-navigation";
import { ConnectedNavigation } from "@prototype/connected-navigation/react";
import { currentPrincipal } from "@/lib/session";
import { config } from "@/lib/config";

export default async function GovukLayout({ children }: { children: React.ReactNode }) {
  const principal = await currentPrincipal();
  const links = delegateNavigationFromEnv(process.env, { mode: process.env.PUBLIC_MODE === "true" ? "public" : "private" });
  return (
    <>
      <header className="service-header">
        <div className="width-container service-header__inner">
          <Link className="brand-link" href="/account/delegates">
            <span className="brand-name">GOV.UK</span>
          </Link>
          <span className="service-name">Your GOV.UK account</span>
          {principal && (
            <form action="/auth/logout" method="post" className="header-signout">
              <button className="header-link" type="submit">Sign out</button>
            </form>
          )}
          <ConnectedNavigation links={links} activeId="delegate" id="delegate-connected-navigation" />
        </div>
      </header>
      <div className="width-container">
        <div className="phase-banner">
          <strong className="tag">Prototype</strong>
          <span className="small">This is not a real service. <a href={config.aboutUrl}>About this prototype</a></span>
        </div>
      </div>
      <div className="width-container">
        <main id="main-content" className="main-wrapper">{children}</main>
      </div>
      <footer className="service-footer">
        <div className="width-container">
          <ul className="footer-links">
            <li><a href={config.aboutUrl}>About this prototype</a></li>
            <li><span>Accessibility statement</span></li>
            <li><span>Cookies</span></li>
            <li><span>Privacy</span></li>
          </ul>
        </div>
      </footer>
    </>
  );
}
