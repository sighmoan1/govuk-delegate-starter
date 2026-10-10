import { prisma } from "@/lib/db";
import { gate } from "@/lib/ground-truth";
import type { DashboardEvent } from "@/lib/dashboard";
import { Event } from "@prototype/research-feed";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
 const research = new URL(req.url).searchParams.get('mode') === 'research';
 const denied = gate(req, research ? 'evaluation' : 'collection');
 const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
 if (denied) return Response.json({ error: denied===503 ? 'Access not configured' : 'Access key required' }, { status: denied, headers });
 try {
  const snapshots = await prisma.observedEvent.findMany({ orderBy: [{ occurredAt:'desc' }, { id:'desc' }], take:501 });
  const bindings = await prisma.researchBinding.findMany({ where: { OR: snapshots.map(s=>({sourceService:s.sourceService,sourceEventId:s.sourceEventId})) },
    select: research ? { sourceService:true,sourceEventId:true,effectClass:true,operationId:true,attempt:{ select:{runId:true,status:true,executionClass:true,provenance:true,run:{select:{protocolVersion:true,sourceCommit:true,seed:true}}} } } : {sourceService:true,sourceEventId:true,effectClass:true,operationId:true,attempt:{select:{runId:true}}} });
  const bySource = new Map(bindings.map(b=>[`${b.sourceService}:${b.sourceEventId}`, b]));
  let invalid = 0;
  const events: DashboardEvent[] = snapshots.slice(0,500).flatMap(s=>{
   const parsed=Event.safeParse(s.snapshot); if(!parsed.success){invalid++;return [];}
   const b=bySource.get(`${s.sourceService}:${s.sourceEventId}`);
   const row: DashboardEvent={id:s.id,receivedAt:s.receivedAt.toISOString(),event:parsed.data,binding:b?{runId:b.attempt.runId,effectClass:b.effectClass,operationId:b.operationId}:null};
   if(research && b && 'status' in b.attempt) { const a=b.attempt as unknown as {status:string;executionClass:string|null;provenance:unknown;run:{protocolVersion:string;sourceCommit:string;seed:string}}; row.truth={status:a.status,executionClass:a.executionClass,provenance:a.provenance,...a.run}; }
   return [row];
  });
  return Response.json({events,invalid,truncated:snapshots.length>500,refreshedAt:new Date().toISOString()}, {headers});
 } catch { return Response.json({error:'Observation store unavailable'}, {status:503,headers}); }
}
