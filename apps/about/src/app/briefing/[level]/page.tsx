import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import pack from "@/lib/briefing-content.json";
import "../briefing.css";

type Level = keyof typeof pack.briefings;
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(pack.briefings).map(level => ({ level })); }
export async function generateMetadata({ params }: { params: Promise<{ level: string }> }): Promise<Metadata> {
  const { level } = await params;
  return { title: Object.hasOwn(pack.briefings, level) ? pack.briefings[level as Level].title : "Briefing" };
}
export default async function Briefing({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  if (!Object.hasOwn(pack.briefings, level)) notFound();
  const deck = pack.briefings[level as Level];
  return <article className="briefing-copy">
    <p><Link href="/briefing">All briefings</Link></p>
    <h1>{deck.title}</h1><p className="lead">{deck.duration}</p>
    <p>Independent synthetic prototype. Originally prepared {pack.prepared}; status refreshed {pack.statusUpdated}. Observatory PRs 109–110 are merged. Dated screenshots and evidence retain their recorded source. Real vendor acceptance and genuine participant research remain outstanding.</p>
    <p><a href={`/briefings/${level}.pptx`} download>Download the editable deck</a></p>
    <nav aria-label="Briefing sections"><ol>{deck.slides.map((slide, i) => <li key={slide.title}><a href={`#slide-${i + 1}`}>{slide.title}</a></li>)}</ol></nav>
    {deck.slides.map((slide, i) => {
      const item = slide as typeof slide & { table?: string[][]; image?: string; demo?: string };
      return <section key={slide.title} id={`slide-${i + 1}`} className="briefing-section">
        <h2>{slide.title}</h2>{slide.paragraphs.map(p => <p key={p}>{p}</p>)}
        {item.table && <div className="table-container"><table><caption>{slide.title}</caption><thead><tr>{item.table[0].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{item.table.slice(1).map(row => <tr key={row[0]}>{row.map((cell, c) => c === 0 ? <th scope="row" key={c}>{cell}</th> : <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>}
        {item.image && <figure><img src={`/briefings/assets/${item.image}`} alt="Observatory review interface showing monitoring access controls" /><figcaption>Isolated synthetic review stack, 10 October 2026. PRs 109–110. This screenshot supplies no participant or vendor result.</figcaption></figure>}
        {item.demo && <p><Link href={`/briefing/demo#${item.demo.toLowerCase()}`}>Demonstration {item.demo}</Link></p>}
        <details><summary>Speaker notes</summary><p>{slide.notes}</p></details>
        <p className="small">Sources: {slide.sources.map((id, n) => { const s = pack.sources[id as keyof typeof pack.sources]; return <span key={id}>{n > 0 ? "; " : ""}<a href={s.url}>{s.title}</a></span>; })}</p>
      </section>;
    })}
  </article>;
}
