import {describe,it,expect} from 'vitest';
import {designStylesheetHref} from '../src/assets';
import {publicEvidenceHandler} from '../src/public-evidence';
const origin='https://bins.example';
describe('reviewed public live evidence',()=>{
 it('requires explicit publication and leaves unrelated routes to their handler',async()=>{
  expect((await publicEvidenceHandler(new Request(origin+'/evidence'),false))!.status).toBe(404);
  expect(await publicEvidenceHandler(new Request(origin+'/api/research/events'),true)).toBeNull();
 });
 it('serves the bounded reviewed record without publishing a source feed',async()=>{
  const response=(await publicEvidenceHandler(new Request(origin+'/evidence'),true))!;
  expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('text/html');
  const text=await response.text();expect(text).toContain('href="'+designStylesheetHref+'"');expect(text).not.toContain('href="/design.css"');expect(text).toContain('10 October 2026');expect(text).toContain('Cancellation is unverified');expect(text).toContain('control stays disabled');expect(text).toContain('test subscription remains active');
  expect(text).toContain('Twenty events are not twenty independent actions');expect(text).toContain('Sam’s identity');
 });
 it('allows local design-system fonts while retaining strict resource and embedding restrictions',async()=>{
  const response=(await publicEvidenceHandler(new Request(origin+'/evidence'),true))!;
  const directives=Object.fromEntries(response.headers.get('content-security-policy')!.split(';').map(value=>{const [name,...sources]=value.trim().split(/\s+/);return [name,sources];}));
  expect(directives).toEqual({'default-src':["'none'"],'style-src':["'self'"],'font-src':["'self'"],'base-uri':["'none'"],'frame-ancestors':["'none'"]});
 });
 it('refuses writes to the public evidence page',async()=>{
  const response=(await publicEvidenceHandler(new Request(origin+'/evidence',{method:'POST'}),true))!;
  expect(response.status).toBe(405);expect(response.headers.get('allow')).toBe('GET');
 });
});
