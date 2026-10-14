'use client';
import { useState } from 'react';
import type { BotDSample } from '@/lib/auxiliary-sensors';
export default function BotDSensor({ binding }: { binding: { session_id: string; nonce: string } }) {
  const [message, setMessage] = useState('BotD has not run.'), [busy, setBusy] = useState(false);
  async function measure() {
    setBusy(true);
    let botd: BotDSample;
    try {
      const { load } = await import('@fingerprintjs/botd');
      const detector = await load({ monitoring: false });
      const result = detector.detect();
      botd = { status: 'observed', value: result.bot };
    } catch { botd = { status: 'error', value: null }; }
    try {
      const response = await fetch('/api/research/fingerprint/sample', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonce: binding.nonce, sample: { state: 'not_run' }, botd }) });
      setMessage(response.ok ? `Stored BotD client observation: ${botd.status}${botd.value === null ? '' : ` (automation flag ${botd.value})`}. This does not establish AI execution or human identity.` : 'Research collection unavailable. HMRC access is unaffected.');
    } catch { setMessage('Research collection unavailable. HMRC access is unaffected.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Local automation research"><p>BotD runs locally after you request a sample, with vendor usage monitoring disabled. Its automation flag is a fallible client claim, not human/AI ground truth.</p><button className="button" disabled={busy} onClick={measure}>Collect one local BotD sample</button><p role="status">{message}</p></section>;
}
