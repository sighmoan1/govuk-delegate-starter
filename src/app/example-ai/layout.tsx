import Link from "next/link";
import "./example-ai.css";
import { config } from "@/lib/config";

// Example AI's own app. A third party, so it does not look like GOV.UK, and it
// never reads the person's GOV.UK session.
export default function ExampleAiLayout({ children }: { children: React.ReactNode }) {
  const llm = config.agentMode === "llm";
  return (
    <div className="xai">
      <header className="xai-header">
        <div className="xai-container xai-header__inner">
          <Link className="xai-brand" href="/example-ai">Example AI <span>assistant</span></Link>
          <span className="xai-mode">{llm ? `Live agent · ${config.anthropicModel}` : "Scripted demo agent"}</span>
        </div>
      </header>
      <main id="main-content" className="xai-container xai-main">{children}</main>
      <footer className="xai-footer xai-container">
        <p>
          Example AI is a fictional third-party app in an independent prototype. It acts for you with HMRC only through permission you give on
          GOV.UK. <Link href="/">About the prototype</Link>
        </p>
      </footer>
    </div>
  );
}
