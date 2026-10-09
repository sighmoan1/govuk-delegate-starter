export default function Page() {
  return <>
    <p className="caption">Internal research workbench · scaffold</p>
    <h1>Understand automated service activity</h1>
    <p className="lead">A separate place to study what services can observe about human and agent activity.</p>
    <div className="research-notice" role="note">
      <strong>Research prototype — no study results yet.</strong>
      <p>Use synthetic fixtures only. Consented human research needs a named study owner and an agreed consent process before collection.</p>
    </div>
    <h2>Current status</h2>
    <dl className="research-status">
      <div><dt>Research protocol</dt><dd>Version 0.1 recorded. Study execution has not started.</dd></div>
      <div><dt>Service feeds</dt><dd>Opt-in synthetic feeds are available. Collection is disabled by default; no live study status is inferred here.</dd></div>
      <div><dt>Predictions and results</dt><dd>Not implemented. No automation scores or measured performance.</dd></div>
    </dl>
    <h2>Research boundaries</h2>
    <ul>
      <li>Observatory cannot change service consent, authority, queue order or throughput.</li>
      <li>Unidentified activity can include legitimate people and accessibility tools.</li>
      <li>Automation, lawful authority and harmful effects are separate questions.</li>
    </ul>
    <p>The workbench has its own database and health endpoint. Its outage does not stop HMRC or Delegate.</p>
  </>;
}
