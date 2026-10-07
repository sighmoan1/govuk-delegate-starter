import type { Metadata } from "next";
import Link from "next/link";
import "./example-ai.css";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: "Example AI (demo agent)", template: "%s – Example AI" },
  description: "A fictional third-party agent in the GOV.UK Delegate prototype. It acts for a person with HMRC only with permission given through GOV.UK Delegate.",
};
export const dynamic = "force-dynamic";

// Example AI's own app. A third party: it does not look like GOV.UK and it
// never sees the person's GOV.UK session.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body className="xai">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="xai-header">
          <div className="xai-container xai-header__inner">
            <Link className="xai-brand" href="/">Example AI <span>Sam’s assistant</span></Link>
            <nav aria-label="Example AI">
              <ul className="xai-nav">
                <li><Link href="/">Task</Link></li>
                <li><Link href="/bot">Unregistered bot</Link></li>
                <li><Link href="/flood">Flood test</Link></li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main-content" className="xai-container xai-main">{children}</main>
        <footer className="xai-footer xai-container">
          <p>
            Example AI is a fictional third-party app in an independent prototype. It acts for Sam with HMRC only through permission given on{" "}
            <a href={config.delegateUrl}>GOV.UK Delegate</a>. See <a href={`${config.hmrcUrl}/ops`}>HMRC’s operations view</a> for how its requests are treated.
          </p>
        </footer>
      </body>
    </html>
  );
}
