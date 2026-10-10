import {readFile} from 'node:fs/promises';
import type {ServerResponse} from 'node:http';

const fonts:Record<string,string>={
 '/assets/fonts/LexendDeca-400.woff2':'LexendDeca-400.woff2',
 '/assets/fonts/LexendDeca-700.woff2':'LexendDeca-700.woff2',
};
// Resolve only fixed public assets, never a caller-supplied filesystem path.
export async function publicAssetHandler(request:Request):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 const font=fonts[path];
 if(path!=='/design.css'&&!path.startsWith('/assets/'))return null;
 if(path!=='/design.css'&&!font)return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 const file=font?new URL('../../about/public/assets/fonts/'+font,import.meta.url):new URL('../../../styles/design.css',import.meta.url);
 return new Response(new Uint8Array(await readFile(file)),{headers:{'content-type':font?'font/woff2':'text/css; charset=utf-8'}});
}

export async function writeHttpResponse(answer:Response,response:ServerResponse,head=false):Promise<void>{
 const body=head?undefined:Buffer.from(await answer.arrayBuffer());
 response.writeHead(answer.status,{'X-Content-Type-Options':'nosniff',...Object.fromEntries(answer.headers)});
 response.end(body);
}
