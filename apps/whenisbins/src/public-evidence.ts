import {readFile} from 'node:fs/promises';
import {connectedNavigationScriptHref,connectedNavigationStylesheetHref,designStylesheetHref} from './assets';
import {delegateNavigationFromEnv} from '@prototype/connected-navigation';
import {renderConnectedNavigation} from '@prototype/connected-navigation/html';

export async function publicEvidenceHandler(request:Request,published:boolean):Promise<Response|null> {
 if(new URL(request.url).pathname!=='/evidence')return null;
 if(!published)return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 const nav=renderConnectedNavigation({links:delegateNavigationFromEnv(process.env,{mode:'public'}),activeId:'whenisbins',id:'whenisbins-connected-navigation'});
 const html=(await readFile(new URL('../evidence.html',import.meta.url),'utf8'))
  .replace(
   '<link rel="stylesheet" href="/design.css">',
   '<link rel="stylesheet" href="'+designStylesheetHref+'"><link rel="stylesheet" href="'+connectedNavigationStylesheetHref+'"><script src="'+connectedNavigationScriptHref+'" defer></script>',
  )
  .replace('<main id="main-content" class="width-container main-wrapper">','<header class="service-header"><div class="width-container service-header__inner"><a class="brand-link" href="/"><span class="brand-name">WhenIsBins<span class="brand-dot">.</span></span></a>'+nav+'</div></header><main id="main-content" class="width-container main-wrapper">');
 return new Response(html,{headers:{
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, no-transform',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
 }});
}
