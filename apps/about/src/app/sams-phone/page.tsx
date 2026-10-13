import type { Metadata } from "next";
import { demoConsoleKey, urls } from "@/lib/config";
import { resetDemo } from "@/lib/reset";

export const metadata: Metadata = { title: "Sam’s phone" };
export const dynamic = "force-dynamic";

type Sam = { strict: boolean; email: string; password: string; phone_ending: string; code: string | null; sent_at: string | null };

async function sam(): Promise<Sam | null> {
  try {
    const res = await fetch(`${urls.oneLoginInternal}/api/demo/sam`, { headers: { "x-demo-key": demoConsoleKey() }, cache: "no-store" });
    return res.ok ? ((await res.json()) as Sam) : null;
  } catch {
    return null;
  }
}

export default async function SamsPhone({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const s = await sam();
  return (
    <div className="two-thirds">
      {/* Refreshes by itself, like waiting for a text message. */}
      <meta httpEquiv="refresh" content="5" />
      <h1>Sam’s phone</h1>
      <p className="lead">
        When the demo is on public URLs, signing in to GOV.UK One Login needs Sam’s password and a code texted to her phone. In real life,
        an assistant working for Sam doesn’t have either. Here they are, for you to play Sam.
      </p>
      <section className="start-from" aria-labelledby="reset-h">
        <h2 id="reset-h">Reset the demo</h2>
        {reset && <p className="start-from__done" role="status">Reset. Everything is back to the start.</p>}
        <p>Restore the synthetic Delegate and HMRC demo to its starting state.</p>
        <form action={resetDemo}>
          <input type="hidden" name="mode" value="clean" />
          <input type="hidden" name="back" value="/sams-phone" />
          <button className="button button--secondary" type="submit">Reset everything</button>
        </form>
      </section>
      {!s && <p>Can’t reach One Login’s demo details. Is it running?</p>}
      {s && !s.strict && (
        <p>
          The demo is running locally, so sign-in is easy: the email and password are pre-filled and there is no code. Start it on public
          URLs (<code>npm run public</code>) for the real checks.
        </p>
      )}
      {s?.strict && (
        <>
          <h2>What Sam knows</h2>
          <dl className="about-facts">
            <dt>Email address</dt><dd><code>{s.email}</code></dd>
            <dt>Password</dt><dd><code>{s.password}</code></dd>
          </dl>
          <h2>Text messages to the phone ending {s.phone_ending}</h2>
          {s.code ? (
            <p className="code-panel code-panel--big" aria-label={`Code ${s.code.split("").join(" ")}`}>{s.code}</p>
          ) : (
            <p>No message yet. A code arrives after the password is entered at One Login.</p>
          )}
          {s.sent_at && <p className="small">Sent at {new Date(s.sent_at).toLocaleTimeString("en-GB")}. Codes last 15 minutes.</p>}
          <p className="small">
            Only enter these yourself, as Sam. If you give them to an assistant, you’re choosing to let it pretend to be her: that is what
            the prototype is meant to test.
          </p>
        </>
      )}
    </div>
  );
}
