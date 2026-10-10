import {readFile} from 'node:fs/promises';

export async function publicEvidenceHandler(request:Request,published:boolean):Promise<Response|null> {
 if(new URL(request.url).pathname!=='/evidence')return null;
 if(!published)return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 return new Response(await readFile(new URL('../evidence.html',import.meta.url),'utf8'),{headers:{
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, no-transform',
  'content-security-policy':"default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'",
 }});
}
