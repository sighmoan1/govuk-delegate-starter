import {readFile} from 'node:fs/promises';
import {designStylesheetHref} from './assets';

export async function publicEvidenceHandler(request:Request,published:boolean):Promise<Response|null> {
 if(new URL(request.url).pathname!=='/evidence')return null;
 if(!published)return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 const html=(await readFile(new URL('../evidence.html',import.meta.url),'utf8')).replace('href="/design.css"','href="'+designStylesheetHref+'"');
 return new Response(html,{headers:{
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, no-transform',
  'content-security-policy':"default-src 'none'; style-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
 }});
}
