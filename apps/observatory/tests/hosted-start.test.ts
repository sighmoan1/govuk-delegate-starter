import { expect, it } from 'vitest';
import { validateHosted } from '../scripts/start-hosted.mjs';
const configured = () => ({ DATABASE_URL: 'postgresql://observer:example@db.example/observatory?sslmode=require', OBSERVATORY_COLLECTION_KEY: 'c'.repeat(64), OBSERVATORY_EVALUATION_KEY: 'e'.repeat(64), PUBLIC_MODE: 'false', PORT: '10000' });
it('requires TLS, distinct strong keys and a valid platform port', () => {
  expect(validateHosted(configured())).toBe(10000);
  expect(() => validateHosted({ ...configured(), DATABASE_URL: 'postgresql://observer:example@db.example/observatory' })).toThrow('DATABASE_TLS_REQUIRED');
  expect(() => validateHosted({ ...configured(), OBSERVATORY_COLLECTION_KEY: 'e'.repeat(64) })).toThrow('DISTINCT_RESEARCH_KEYS_REQUIRED');
  expect(() => validateHosted({ ...configured(), OBSERVATORY_EVALUATION_KEY: 'short' })).toThrow('STRONG_RESEARCH_KEYS_REQUIRED');
  expect(() => validateHosted({ ...configured(), PUBLIC_MODE: 'true' })).toThrow('PUBLIC_MODE_DISALLOWS_RESEARCH');
  expect(() => validateHosted({ ...configured(), PORT: 'shell command' })).toThrow('INVALID_PORT');
});
