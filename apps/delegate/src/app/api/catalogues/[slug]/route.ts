import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
// Discovery carries no credentials, citizen relationships or permission to act.
export async function GET(_req:Request,ctx:{params:Promise<{slug:string}>}){const {slug}=await ctx.params;const row=await prisma.serviceCatalogue.findFirst({where:{service:{slug}},orderBy:{version:'desc'}});if(!row)return NextResponse.json({error:'NOT_FOUND'},{status:404});return NextResponse.json({version:row.version,digest:row.digest,catalogue:row.document},{headers:{'cache-control':'no-store'}});}
