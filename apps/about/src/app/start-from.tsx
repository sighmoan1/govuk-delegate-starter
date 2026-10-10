import { resetDemo } from "@/lib/reset";

type Mode = "clean" | "with-access";

const LABEL: Record<Mode, string> = {
  clean: "Start clean",
  "with-access": "Start with an agent already authorised",
};
const HINT: Record<Mode, string> = {
  clean: "Nobody can act for Sam. HMRC has no claim from Sam.",
  "with-access": "Sam has already let the assistant view her tax code and claim tax relief. HMRC has no claim yet.",
};

/** Resets the services to a starting point for this scenario. */
export function StartFrom({ back, recommended, done }: { back: string; recommended: Mode; done?: string }) {
  const order: Mode[] = recommended === "clean" ? ["clean", "with-access"] : ["with-access", "clean"];
  return (
    <section id="start" className="start-from" aria-labelledby="start-h">
      <h2 id="start-h">Starting point</h2>
      {done && (
        <p className="start-from__done" role="status">
          Reset. {done === "with-access" ? HINT["with-access"] : HINT.clean}
        </p>
      )}
      <p>This resets Delegate and HMRC. You’ll need to sign in again.</p>
      <div className="start-from__options">
        {order.map((mode, i) => (
          <form action={resetDemo} key={mode}>
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="back" value={back} />
            <button className={`button${i === 0 ? "" : " button--secondary"}`} type="submit">{LABEL[mode]}</button>
            <p className="small">{HINT[mode]}{i === 0 ? " Best for this scenario." : ""}</p>
          </form>
        ))}
      </div>
    </section>
  );
}
