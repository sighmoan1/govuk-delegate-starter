import { NextResponse } from 'next/server';
import { authenticatedService, publishCatalogue, validateCatalogue, readCatalogueBody } from '@/lib/catalogues';
import { prisma } from '@/lib/db';
import { fail } from '@/lib/http';
import { DomainError } from '@/lib/requests';
type Context={params:Promise<{slug:string}>};
export async function POST(req:Request,ctx:Context){try{
 const {slug}=await ctx.params;const service=await authenticatedService(req,slug);
 if(Number(req.headers.get('content-length')??0)>65536)throw new DomainError('INVALID_CATALOGUE','Body exceeds 64 KiB',413);
 const value=await readCatalogueBody(req);
 const result=await publishCatalogue(service.id,validateCatalogue(value,slug));
 return NextResponse.json({id:result.row.id,version:result.row.version,digest:result.row.digest,replayed:result.replayed},{status:result.replayed?200:201});
}catch(e){return fail(e);}}
export async function GET(req:Request,ctx:Context){try{const {slug}=await ctx.params;const service=await authenticatedService(req,slug);const version=new URL(req.url).searchParams.get('version');if(version!==null&&(!/^\d+$/.test(version)||Number(version)<1))throw new DomainError('INVALID_VERSION','Positive integer version required');const row=await prisma.serviceCatalogue.findFirst({where:{serviceId:service.id,...(version?{version:Number(version)}:{})},orderBy:{version:'desc'}});if(!row)throw new DomainError('NOT_FOUND','Catalogue not found',404);return NextResponse.json(row,{headers:{'cache-control':'private, no-store'}});}catch(e){return fail(e);}}
