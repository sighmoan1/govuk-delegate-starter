import Link from "next/link";
import { config } from "@/lib/config";
import { currentTaxpayer } from "@/lib/session";
import { currentAgentSession } from "@/lib/agent-session";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const taxpayer = await currentTaxpayer();
  const agent = await currentAgentSession();
  return (
    <>
      <header className="service-header hmrc-header">
        <div className="width-container service-header__inner">
          <Link className="brand-link" href="/">
            <span className="brand-name">GOV.UK</span>
          </Link>
          <Link className="service-name" href="/">Claim tax relief for your job expenses</Link>
          {taxpayer && (
            <form action="/auth/logout" method="post" className="header-signout">
              <button className="header-link" type="submit">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <div className="width-container">
        <div className="phase-banner">
          <strong className="tag">Prototype</strong>
          <span className="small">This is not a real HMRC service. <a href={config.aboutUrl}>About this prototype</a></span>
        </div>
      </div>
      <div className="width-container">
        <main id="main-content" className="main-wrapper">
          {agent && (
            <p className="acting-banner" role="status">
              <strong>{agent.agentName}</strong> is acting for this person with their permission.
              <a href="/act-for-someone/stop">Stop</a>
            </p>
          )}
          {children}
        </main>
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
