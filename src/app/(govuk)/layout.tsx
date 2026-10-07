import Link from "next/link";
import { currentPrincipal } from "@/lib/session";
import { Nav } from "../nav";

const LINKS = [
  { href: "/account/delegates", label: "Who can act for you" },
  { href: "/about", label: "About this project" },
];

export default async function GovukLayout({ children }: { children: React.ReactNode }) {
  const principal = await currentPrincipal();
  return (
    <>
      <header className="service-header">
        <div className="width-container service-header__inner">
          <Link className="brand-link" href="/">
            <span className="brand-name">GOV.UK Delegate<span className="brand-dot">.</span></span>
          </Link>
          <Nav links={LINKS} label="GOV.UK account" />
        </div>
      </header>
      <div className="width-container">
        <div className="phase-banner">
          <strong className="tag">Prototype</strong>
          <span className="small">
            An independent prototype using synthetic data. It is not an official GOV.UK service and is not connected to GOV.UK One Login or HMRC.
          </span>
        </div>
      </div>
      <div className="width-container">
        <main id="main-content" className="main-wrapper">
          {principal && (
            <div className="signin-state">
              Signed in to GOV.UK as {principal.displayName}.{" "}
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
            <li><Link href="/example-ai">Example AI assistant (demo agent)</Link></li>
            <li><Link href="/operator/activity">HMRC team view</Link></li>
          </ul>
          <p className="small">Independent prototype. Synthetic data only. No production security, accreditation or official GOV.UK status is claimed.</p>
        </div>
      </footer>
    </>
  );
}
