// Experimental service-owned representative registry. Never mount in a public deployment.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
const digest = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const SAFE_CAPS = new Set(['view_claim_status', 'claim_job_expenses', 'respond_to_query', 'check_claim_progress']);

export class LocalAuthority {
  constructor(filename, { serviceKey, service = 'hmrc-personal-tax' }) {
    if (!serviceKey) throw new Error('serviceKey required');
    this.service = service; this.serviceKey = serviceKey;
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE, expires INTEGER);
      CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, principal TEXT, subject TEXT, agent TEXT, caps TEXT, expires INTEGER, revoked INTEGER);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, at INTEGER, kind TEXT, data TEXT);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, key TEXT UNIQUE, grant_id TEXT, data TEXT);`);
  }
  event(kind, data) { const id = randomUUID(); this.db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(id, Date.now(), kind, JSON.stringify(data)); return id; }
  registerAgent(ttlMs = 900_000) {
    const token = randomBytes(32).toString('base64url'); const id = randomUUID();
    this.db.prepare('INSERT INTO agents VALUES(?,?,?)').run(id, digest(token), Date.now() + ttlMs);
    return { id, token };
  }
  // Only invoked by controlled fixtures acting as the citizen; no agent-facing approval endpoint.
  approve({ principal, subject, agent, capabilities, expires = Date.now() + 30 * 86400_000 }) {
    if (!principal || !subject || !this.db.prepare('SELECT id FROM agents WHERE id=?').get(agent)) throw new Error('invalid citizen/agent fixture');
    if (!capabilities.length || capabilities.some(c => !SAFE_CAPS.has(c))) throw new Error('unsupported capability; consequential step-up excluded from this protocol');
    const id = randomUUID();
    this.db.prepare('INSERT INTO grants VALUES(?,?,?,?,?,?,NULL)').run(id, principal, subject, agent, JSON.stringify(capabilities), expires);
    this.event('citizen_approval', { principal, grant: id, capabilities }); return id;
  }
  revoke(id, principal) {
    const changed = this.db.prepare('UPDATE grants SET revoked=? WHERE id=? AND principal=? AND revoked IS NULL').run(Date.now(), id, principal).changes;
    if (!changed) throw new Error('grant unavailable to citizen');
    this.event('citizen_revocation', { principal, grant: id });
  }
  check(input) {
    const check_id = randomUUID();
    const agent = typeof input.agent_token === 'string' ? this.db.prepare('SELECT * FROM agents WHERE token_hash=?').get(digest(input.agent_token)) : null;
    const deny = reason => { const result = { authorised: false, reason, check_id, ...(agent ? { delegate: { id: agent.id, name: 'Synthetic representative', provider: 'E2 local' } } : {}) }; this.event('authority_check', { principal: input.principal_id, capability: input.capability, ...result }); return result; };
    if (!agent || agent.expires <= Date.now()) return deny('INVALID_AGENT_AUTHENTICATION');
    if (input.service !== this.service) return deny('NO_AUTHORISATION');
    const grants = this.db.prepare('SELECT * FROM grants WHERE principal=? AND agent=? ORDER BY rowid DESC').all(input.principal_id ?? '', agent.id);
    const grant = grants.find(g => !g.revoked && g.expires > Date.now() && JSON.parse(g.caps).includes(input.capability));
    if (!grant) {
      const last = grants[0];
      return deny(!last ? 'NO_AUTHORISATION' : last.revoked ? 'AUTHORISATION_REVOKED' : last.expires <= Date.now() ? 'AUTHORISATION_EXPIRED' : 'PERMISSION_MISSING');
    }
    const result = { authorised: true, status: 'ACTIVE', authorisation_id: grant.id, principal_id: grant.principal, subject: grant.subject,
      delegate: { id: agent.id, name: 'Synthetic representative', provider: 'E2 local' },
      chain: { mandate_id: grant.id, delegation_id: grant.id, parent_delegation_id: null, depth: 0, label: null, assurance: 'REGISTERED' }, check_id };
    this.event('authority_check', { capability: input.capability, ...result }); return result;
  }
  handle(path, input) {
    if (path === '/api/authorisations/check') return this.check(input);
    if (input.service !== this.service) throw new Error('wrong service');
    if (path === '/api/outcomes') { this.event('service_outcome', input); return { ok: true }; }
    if (path === '/api/receipts') {
      const grant = this.db.prepare('SELECT id FROM grants WHERE id=?').get(input.mandate_id);
      if (!grant || input.delegation_id !== grant.id || input.agent_confirmed !== true || !input.idempotency_key) throw new Error('invalid receipt');
      const key = `${this.service}:${input.idempotency_key}`;
      const old = this.db.prepare('SELECT * FROM receipts WHERE key=?').get(key);
      if (old) { if (old.data !== JSON.stringify(input)) throw new Error('receipt key conflict'); return { receipt_id: old.id }; }
      const id = randomUUID(); this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(id, key, grant.id, JSON.stringify(input));
      this.event('receipt', { id, ...input }); return { receipt_id: id };
    }
    if (path === '/api/receipts/status') {
      if (!Array.isArray(input.ids)) throw new Error('invalid receipt ids');
      for (const id of input.ids) if (!this.db.prepare('SELECT id FROM receipts WHERE id=?').get(id)) throw new Error('unknown receipt');
      return { disputed: [] }; // Protocol excludes dispute workflow; never silently accepts unknown receipts.
    }
    throw new Error('unsupported operation');
  }
  logs() { return this.db.prepare('SELECT * FROM events ORDER BY rowid').all().map(e => ({ ...e, data: JSON.parse(e.data) })); }
  async listen(port = 3310) {
    this.server = createServer(async (req, res) => {
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.method !== 'POST' || !equal(req.headers['x-service-key'], this.serviceKey)) return send(401, { error: 'service authentication required' });
      try {
        let body = ''; for await (const part of req) { body += part; if (body.length > 65536) throw new Error('body too large'); }
        send(200, this.handle(req.url, JSON.parse(body)));
      } catch { send(400, { error: 'invalid or unsupported request' }); }
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(port, '127.0.0.1', resolve); });
    return this.server.address().port;
  }
  async close() { if (this.server) await new Promise((resolve, reject) => this.server.close(e => e ? reject(e) : resolve())); this.db.close(); }
}
