import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {ServerResponse} from 'node:http';

// The deployed process serves the same immutable bytes used to name each CSS version.
const stylesheet=readFileSync(new URL('../../../styles/design.css',import.meta.url));
export const designStylesheetVersion=createHash('sha256').update(stylesheet).digest('hex');
export const designStylesheetHref='/design.css?v='+designStylesheetVersion;
const connectedNavigationStylesheet=readFileSync(new URL('../../../packages/connected-navigation/assets/connected-navigation.css',import.meta.url));
const connectedNavigationScript=readFileSync(new URL('../../../packages/connected-navigation/assets/connected-navigation.js',import.meta.url));
export const connectedNavigationStylesheetVersion=createHash('sha256').update(connectedNavigationStylesheet).digest('hex');
export const connectedNavigationScriptVersion=createHash('sha256').update(connectedNavigationScript).digest('hex');
export const connectedNavigationStylesheetHref='/connected-navigation.css?v='+connectedNavigationStylesheetVersion;
export const connectedNavigationScriptHref='/connected-navigation.js?v='+connectedNavigationScriptVersion;

const fonts:Record<string,string>={
 '/assets/fonts/LexendDeca-400.woff2':'LexendDeca-400.woff2',
 '/assets/fonts/LexendDeca-700.woff2':'LexendDeca-700.woff2',
};
// Resolve only fixed public assets, never a caller-supplied filesystem path.
export async function publicAssetHandler(request:Request):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname;
 const font=fonts[path];
 if(!['/design.css','/connected-navigation.css','/connected-navigation.js'].includes(path)&&!path.startsWith('/assets/'))return null;
 if(path.startsWith('/assets/')&&!font)return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 if(path==='/connected-navigation.css'){
  const versioned=url.searchParams.getAll('v').length===1&&url.searchParams.get('v')===connectedNavigationStylesheetVersion;
  return new Response(new Uint8Array(connectedNavigationStylesheet),{headers:{'content-type':'text/css; charset=utf-8','cache-control':versioned?'public, max-age=31536000, immutable':'no-cache, max-age=0, must-revalidate'}});
 }
 if(path==='/connected-navigation.js'){
  const versioned=url.searchParams.getAll('v').length===1&&url.searchParams.get('v')===connectedNavigationScriptVersion;
  return new Response(new Uint8Array(connectedNavigationScript),{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':versioned?'public, max-age=31536000, immutable':'no-cache, max-age=0, must-revalidate'}});
 }
 if(!font){const versioned=url.searchParams.getAll('v').length===1&&url.searchParams.get('v')===designStylesheetVersion;return new Response(new Uint8Array(stylesheet),{headers:{'content-type':'text/css; charset=utf-8','cache-control':versioned?'public, max-age=31536000, immutable':'no-cache, max-age=0, must-revalidate'}});}
 return new Response(new Uint8Array(await readFile(new URL('../../about/public/assets/fonts/'+font,import.meta.url))),{headers:{'content-type':'font/woff2'}});
}

export async function writeHttpResponse(answer:Response,response:ServerResponse,head=false):Promise<void>{
 const body=head?undefined:Buffer.from(await answer.arrayBuffer());
 response.writeHead(answer.status,{'X-Content-Type-Options':'nosniff',...Object.fromEntries(answer.headers)});
 response.end(body);
}
