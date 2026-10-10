import { config } from "@/lib/config";

// The Delegate service team's internal view. Not a public page.
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="internal-header">
        <div className="width-container width-container--wide internal-header__inner">
          <span><strong>Delegate</strong> · Service operations</span>
          <span className="small">Internal · <a href={config.aboutUrl}>About this prototype</a></span>
        </div>
      </header>
      <div className="width-container width-container--wide">
        <main id="main-content" className="main-wrapper">{children}</main>
      </div>
    </>
  );
}
