import type { Metadata } from "next";
import Link from "next/link";
import "./example-ai.css";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: "Example AI", template: "%s – Example AI" },
  description: "Example AI, a personal assistant.",
};
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body className="xai">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="xai-header">
          <div className="xai-container xai-header__inner">
            <Link className="xai-brand" href="/"><span className="xai-mark" aria-hidden="true">✦</span> Example AI</Link>
            <nav aria-label="Account">
              <ul className="xai-nav">
                <li><Link href="/">Chat</Link></li>
                <li><Link href="/settings">Connected services</Link></li>
                <li><span className="xai-avatar" aria-label="Signed in as Sam">S</span></li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main-content" className="xai-container xai-main">{children}</main>
        <footer className="xai-footer xai-container">
          <a href={config.aboutUrl}>About this prototype</a>
        </footer>
      </body>
    </html>
  );
}
