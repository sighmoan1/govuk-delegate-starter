import Link from "next/link";
import { cookies } from "next/headers";
import { demoStep } from "@/lib/demo-state";

export async function DemoGuide() {
  const jar = await cookies();
  const step = await demoStep((n) => jar.get(n)?.value);
  return (
    <aside className="demo-guide" aria-label="Demo guide">
      <div className="width-container width-container--wide demo-guide__inner">
        <span className="demo-guide__label">Demo · step {step.n} of {step.of}</span>
        <span className="demo-guide__text">{step.text}</span>
        {step.href && <Link className="demo-guide__link" href={step.href}>{step.linkText}</Link>}
      </div>
    </aside>
  );
}
