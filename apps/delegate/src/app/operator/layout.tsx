import Link from "next/link";

// The HMRC service team's internal view. Deliberately plain: it is not a citizen surface.
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="operator-header">
        <div className="width-container width-container--wide operator-header__inner">
          <span className="operator-brand">HMRC Personal Tax (demo) · <strong>Service team view</strong></span>
          <span className="small">Internal tool, simulated. <Link href="/">Back to the prototype</Link></span>
        </div>
      </header>
      <div className="width-container width-container--wide">
        <main id="main-content" className="main-wrapper">{children}</main>
      </div>
    </>
  );
}
