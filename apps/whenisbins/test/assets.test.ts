import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {publicAssetHandler,writeHttpResponse} from '../src/assets';

describe('public design asset delivery',()=>{
 it('serves both exact WOFF2 files intact through the actual HTTP response writer',async()=>{
  const server=createServer(async(req,res)=>{try{const answer=await publicAssetHandler(new Request('http://localhost'+req.url,{method:req.method}));await writeHttpResponse(answer??new Response('Not found',{status:404}),res,req.method==='HEAD');}catch{res.writeHead(500);res.end();}});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing test port');
  const origin='http://127.0.0.1:'+address.port;
  try{
   for(const weight of [400,700]){
    const name='LexendDeca-'+weight+'.woff2',response=await fetch(origin+'/assets/fonts/'+name);
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('font/woff2');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const actual=Buffer.from(await response.arrayBuffer()),expected=await readFile(new URL('../../about/public/assets/fonts/'+name,import.meta.url));
    expect(actual.equals(expected)).toBe(true);expect(actual.subarray(0,4).toString()).toBe('wOF2');
    const post=await fetch(origin+'/assets/fonts/'+name,{method:'POST'});expect(post.status).toBe(405);expect(post.headers.get('allow')).toBe('GET');
   }
   for(const path of ['/assets/fonts/unknown.woff2','/assets/fonts/README.txt','/assets/fonts/%2e%2e%2fprivate','/assets/fonts/LexendDeca-700.woff2/extra','/assets/private.json'])expect((await fetch(origin+path)).status).toBe(404);
   const css=await fetch(origin+'/design.css');expect(css.status).toBe(200);expect(await css.text()).toContain('/assets/fonts/LexendDeca-700.woff2');
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 });
 it('does not route private APIs or read unsupported methods',async()=>{
  for(const path of ['/api/research/events','/ops/events','/live/status'])expect(await publicAssetHandler(new Request('http://localhost'+path))).toBeNull();
  const response=await publicAssetHandler(new Request('http://localhost/design.css',{method:'POST'}));expect(response?.status).toBe(405);
 });
});
