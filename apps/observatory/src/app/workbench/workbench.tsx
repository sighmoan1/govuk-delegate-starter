'use client';
import { useRef, useState } from 'react';
import { EvaluationReport } from '../../lib/evaluation-report';

type Metrics = { n: number; classified: number; abstained: number; known_labels: number; prediction_coverage: number | null; precision: number | null; end_to_end_sensitivity: number | null; selective_false_positive_rate: number | null; brier: number | null; auroc: number | null; confusion: { tp: number; fp: number; tn: number; fn: number; positive_abstentions: number; negative_abstentions: number; unknown_labels: number }; reliability: { lower: number; upper: number; n: number; mean_probability: number | null; positive_fraction: number | null }[] };
type Report = { schema: string; mode: string; target: string; corpus_digest: string; model_digest: string; split_digest?: string; holdout_n: number; holdout_groups: number; total_corpus_rows: number; comparisons: { model: string; metrics: Metrics; uncertainty: { method: string; groups: number; intervals: Record<string, { bounds: number[] | null; valid_resamples: number }> | null }; cohorts: Record<string, Metrics>; prevalence_shift: { assumed_prevalence: number; flagged_fraction: number; positive_predictive_value: number | null }[] }[]; limitations: string[]; optional_models?: { name: string; status: string }[] };
const percent = (n: number | null | undefined) => n == null ? 'Unavailable' : `${(n * 100).toFixed(1)}%`;
const number = (n: number | null) => n == null ? 'Unavailable' : n.toFixed(3);
function fixture() {
  const names = ['signature_verified', 'latency_ms', 'browser_present', 'vendor_verified'];
  return { schema: 'observatory-corpus/1', mode: 'synthetic_fixture', protocol_version: 'browser-demonstration/1', source_commit: '0'.repeat(40), rows: Array.from({ length: 100 }, (_, i) => ({ id: `fixture-${i}`, groups: Object.fromEntries(['intent', 'session', 'actor_family', 'scenario_family'].map(k => [k, `${k}-${i}`])), execution_class: i % 2 ? 'AI_AGENT_BROWSER' : 'HUMAN_OPERATED', signals: Object.fromEntries(names.map((f, j) => [f, { value: j === 1 ? (i * 37) % 900 : j === 2 ? true : Boolean(i % (j === 0 ? 3 : 5)), missingness: 'observed', provenance: 'synthetic_fixture', confidence: null }])) })) };
}
export default function Workbench() {
  const generation = useRef(0);
  const [key, setKey] = useState(''), [report, setReport] = useState<Report | null>(null), [corpus, setCorpus] = useState<unknown>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function request(run: boolean) {
    const epoch = ++generation.current;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/evaluation/comparisons', { method: run ? 'POST' : 'GET', headers: { 'x-evaluation-key': key, 'content-type': 'application/json' }, ...(run ? { body: JSON.stringify(corpus ?? fixture()) } : {}), cache: 'no-store' });
      const result = await response.json();
      if (epoch !== generation.current) return;
      if (!response.ok) throw new Error(result.error ?? 'Research unavailable');
      const value = run ? result.report : result[0]?.report;
      if (!value) { setReport(null); setMessage('No recorded comparisons yet.'); return; }
      setReport(value); setMessage(run ? 'Comparison saved. Dataset and splits were frozen before evaluation.' : 'Latest recorded comparison loaded.');
    } catch (e) { if (epoch === generation.current) setMessage(e instanceof Error ? e.message : 'Unable to load research'); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  async function load(file: File | undefined, kind: 'corpus' | 'report') {
    if (!file) return;
    const epoch = ++generation.current;
    try {
      if (file.size > 256000) throw new Error('Use a JSON file smaller than 256 KB.');
      const parsed = JSON.parse(await file.text());
      if (epoch !== generation.current) return;
      if (kind === 'corpus') { if (parsed.schema !== 'observatory-corpus/1' || parsed.mode !== 'synthetic_fixture') throw new Error('Hosted experiments currently accept synthetic fixtures only.'); setCorpus(parsed); setMessage('Synthetic corpus selected. Run comparison to validate and freeze it.'); }
      else { const valid = EvaluationReport.safeParse(parsed); if (!valid.success) throw new Error('Choose a valid Observatory evaluation report.'); generation.current++; setBusy(false); setReport(valid.data as Report); setMessage('Report opened in this browser only. It has not been uploaded or independently verified.'); }
    } catch (e) { if (epoch === generation.current) setMessage(e instanceof Error ? e.message : 'Invalid file'); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'observatory-evaluation.json'; link.click(); URL.revokeObjectURL(url);
  }
  return <>
    <p><a href="/">Event monitoring</a> · <a href="/workbench" aria-current="page">Detection workbench</a></p>
    <h1>Compare detection evidence</h1>
    <p className="lead">Test which signals help distinguish AI-directed transactions in a controlled sample.</p>
    <p className="inset-text">This is an independent research prototype. Generated fixtures test the software; they do not establish detector accuracy or the prevalence of AI in government services.</p>
    <section aria-labelledby="experiment-heading">
      <h2 id="experiment-heading">Run an experiment</h2>
      <label className="label" htmlFor="evaluation-key">Research evaluation key</label>
      <input className="input" id="evaluation-key" type="password" autoComplete="off" value={key} onChange={e => { generation.current++; setBusy(false); setKey(e.target.value); setReport(null); setCorpus(null); }} />
      <p className="hint">Held only in page memory. Stored studies require evaluator access.</p>
      <label className="label" htmlFor="corpus-file">Optional synthetic corpus JSON</label>
      <input id="corpus-file" type="file" accept="application/json,.json" onChange={e => load(e.target.files?.[0], 'corpus')} />
      <p>Without a file, this runs 100 generated rows with arbitrary overlapping signals. Human-labelled fixture rows are generated data, with no human participant execution.</p>
      <p>Compare the signature rule, logistic model and four signal-removal ablations on identical training, calibration and holdout groups. Each model chooses its threshold on calibration only.</p>
      <div className="button-row"><button className="button" disabled={busy || key.length < 32} onClick={() => request(true)}>{busy ? 'Working…' : 'Run comparison and ablations'}</button><button className="button button--secondary" disabled={busy || key.length < 32} onClick={() => request(false)}>Load latest saved run</button><button className="button button--secondary" onClick={() => { generation.current++; setBusy(false); setKey(''); setCorpus(null); setReport(null); setMessage('Research cleared from page memory.'); }}>Clear research</button></div>
    </section>
    <details><summary>Open an existing report</summary><p>Inspect an aggregate JSON report locally without uploading it. Imported reports retain their claimed provenance and are not authenticated evidence.</p><label className="label" htmlFor="report-file">Evaluation report JSON</label><input id="report-file" type="file" accept="application/json,.json" onChange={e => load(e.target.files?.[0], 'report')} /></details>
    <p role="status" aria-live="polite">{message}</p>
    {report && <section aria-labelledby="results-heading">
      <h2 id="results-heading">{report.mode === 'synthetic_fixture' ? 'Synthetic fixture results' : 'Imported research results'}</h2>
      <p>Target: {report.target}. {report.holdout_n} held-out rows in {report.holdout_groups} groups, from {report.total_corpus_rows} corpus rows.</p>
      <dl className="summary-list"><div><dt>Dataset digest</dt><dd className="research-digest">{report.corpus_digest}</dd></div><div><dt>Split digest</dt><dd className="research-digest">{report.split_digest ?? 'Not in this report'}</dd></div></dl>
      <div className="table-container"><table><caption>Detection and coverage on the same holdout</caption><thead><tr><th>Model</th><th>Coverage</th><th>Precision</th><th>Detected / all known positives</th><th>False positives / classified negatives</th><th>Brier</th><th>AUROC</th></tr></thead><tbody>{report.comparisons.map(c => <tr key={c.model}><th scope="row">{c.model}</th><td>{percent(c.metrics.prediction_coverage)} ({c.metrics.classified}/{c.metrics.n})</td><td>{percent(c.metrics.precision)}</td><td>{percent(c.metrics.end_to_end_sensitivity)}</td><td>{percent(c.metrics.selective_false_positive_rate)}</td><td>{number(c.metrics.brier)}</td><td>{number(c.metrics.auroc)}</td></tr>)}</tbody></table></div>
      {report.comparisons.map(c => <details key={c.model}><summary>{c.model}: errors, calibration and uncertainty</summary>
        <p>True positives {c.metrics.confusion.tp}; false positives {c.metrics.confusion.fp}; true negatives {c.metrics.confusion.tn}; false negatives {c.metrics.confusion.fn}. Positive abstentions {c.metrics.confusion.positive_abstentions}; negative abstentions {c.metrics.confusion.negative_abstentions}; unknown labels {c.metrics.confusion.unknown_labels}.</p>
        <p>Uncertainty: {c.uncertainty.method}, {c.uncertainty.groups} groups. Intervals do not cover selection bias, unknown-label error or real-world transfer.</p>
        {c.uncertainty.intervals && <ul>{Object.entries(c.uncertainty.intervals).map(([name, value]) => <li key={name}>{name}: {value.bounds ? `${percent(value.bounds[0])}–${percent(value.bounds[1])}` : 'Unavailable'} ({value.valid_resamples} valid resamples)</li>)}</ul>}
        <div className="table-container"><table><caption>Results by execution cohort</caption><thead><tr><th>Cohort</th><th>Rows</th><th>Coverage</th><th>False positives</th><th>False negatives</th></tr></thead><tbody>{Object.entries(c.cohorts).map(([name, m]) => <tr key={name}><th scope="row">{name}</th><td>{m.n}</td><td>{percent(m.prediction_coverage)}</td><td>{m.confusion.fp}</td><td>{m.confusion.fn}</td></tr>)}</tbody></table></div>
        <div className="table-container"><table><caption>Reliability bins: prediction versus observed positive fraction</caption><thead><tr><th>Score range</th><th>Rows</th><th>Mean score</th><th>Positive fraction</th></tr></thead><tbody>{c.metrics.reliability.filter(b => b.n).map(b => <tr key={b.lower}><th scope="row">{b.lower.toFixed(1)}–{b.upper.toFixed(1)}</th><td>{b.n}</td><td>{percent(b.mean_probability)}</td><td>{percent(b.positive_fraction)}</td></tr>)}</tbody></table></div>
        <div className="table-container"><table><caption>Simulated prevalence shift, holding classified-sample error rates fixed</caption><thead><tr><th>Assumed prevalence</th><th>Flagged fraction</th><th>Positive predictive value</th></tr></thead><tbody>{c.prevalence_shift.filter((_, i) => i % 4 === 0).map(p => <tr key={p.assumed_prevalence}><th scope="row">{percent(p.assumed_prevalence)}</th><td>{percent(p.flagged_fraction)}</td><td>{percent(p.positive_predictive_value)}</td></tr>)}</tbody></table></div>
      </details>)}
      <h3>Evidence limits</h3><ul>{report.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p>Population prevalence: unavailable. Service demand and business effects are recorded separately in event monitoring.</p>
      <ul>{report.optional_models?.map(m => <li key={m.name}>{m.name}: {m.status}</li>)}</ul>
      <button className="button button--secondary" onClick={download}>Export versioned results</button>
    </section>}
  </>;
}
