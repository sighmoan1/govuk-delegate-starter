import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { attemptInput, bindingInput, counts, gate, publicSession, runInput, verifiedProvenance, validateBindingAgainstSource } from "../src/lib/ground-truth";
import { researchRoute } from "../src/lib/research-http";
const key = 'evaluation-key-synthetic-only-0123456789';
const collection = 'collection-key-synthetic-only-0123456789';
const env = { OBSERVATORY_EVALUATION_KEY: key, OBSERVATORY_COLLECTION_KEY: collection };
const trace = { origin: 'CONTROLLED_RUNNER', execution_class: 'SCRIPTED_AUTOMATION', trace_digest: 'a'.repeat(64), source_commit: 'b'.repeat(40), runner: 'e2-fixed-http-v1', observed_at: new Date(0).toISOString() };
describe('truth isolation and provenance', () => {
  it('separates evaluator and collection credentials and fails closed disabled/public/misconfigured', () => {
    for (const kind of ['evaluation','collection'] as const) {
      expect(gate(new Request('http://local'),kind,{})).toBe(503);
      expect(gate(new Request('http://local',{headers:{'x-collection-key':collection}}),'evaluation',env)).toBe(401);
      expect(gate(new Request('http://local',{headers:{'x-evaluation-key':key}}),'collection',env)).toBe(401);
      expect(gate(new Request('http://local',{headers:{[kind==='evaluation'?'x-evaluation-key':'x-collection-key']:kind==='evaluation'?key:collection}}),kind,env)).toBeNull();
      expect(gate(new Request('http://local'),kind,{...env,PUBLIC_MODE:'true'})).toBe(503);
      expect(gate(new Request('http://local'),kind,{...env,OBSERVATORY_COLLECTION_KEY:key})).toBe(503);
    }
  });
  it('denied HTTP access never invokes privileged handler', async () => {
    let calls=0; const result=await researchRoute('evaluation',async()=>{calls++;return{execution_class:'HUMAN_OPERATED'};})(new Request('http://local'));
    expect([401,503]).toContain(result.status);expect(calls).toBe(0);expect(await result.text()).not.toContain('HUMAN_OPERATED');expect(result.headers.get('cache-control')).toContain('no-store');
  });
  it('uses opaque UUIDs, not cohort labels in correlation metadata', () => {
    const run=runInput({mode:'CONTROLLED',protocol_version:'0.1',source_commit:'a'.repeat(40),seed:'42',study_owner:'researcher-pseudonym'});
    expect(run.id).toMatch(/^[a-f0-9-]{36}$/);expect(run.id).not.toContain('HUMAN');
    expect(()=>attemptInput({run_id:'HUMAN-test'},'CONTROLLED')).toThrow();
    expect(attemptInput({run_id:run.id},'CONTROLLED').status).toBe('PLANNED');
  });
  it('monitoring is permanently unlabelled; models/UA/predictions cannot supply truth', () => {
    expect(attemptInput({run_id:randomUUID()},'MONITORING').status).toBe('UNLABELLED');
    expect(()=>verifiedProvenance(trace,'MONITORING')).toThrow('MONITORING_HAS_NO_TRUTH');
    for (const extra of [{user_agent:'human browser'},{prediction:.99},{fingerprint_label:'human'}]) expect(()=>verifiedProvenance({...trace,...extra},'CONTROLLED')).toThrow('UNEXPECTED_FIELD');
  });
  it('scripted browser automation cannot attest human ground truth', () => {
    expect(()=>verifiedProvenance({...trace,execution_class:'HUMAN_OPERATED'},'CONTROLLED')).toThrow('HUMAN_EXECUTION_EVIDENCE_REQUIRED');
    expect(verifiedProvenance(trace,'CONTROLLED').executionClass).toBe('SCRIPTED_AUTOMATION');
    expect(()=>verifiedProvenance({...trace,execution_class:'AI_AGENT_BROWSER'},'CONTROLLED')).toThrow('AGENT_TRACE_REQUIRED');
  });
  it('real-human enrolment starts without a label and needs explicit observer/consent/trace attestation', () => {
    const human={origin:'RESEARCH_OBSERVER',execution_class:'HUMAN_OPERATED',trace_digest:'a'.repeat(64),observed_at:new Date(0).toISOString(),observer_pseudonym:'observer-1',consent_ref:'c'.repeat(64),manual_operation_attested:true};
    expect(()=>verifiedProvenance({...human,manual_operation_attested:false},'CONTROLLED')).toThrow();
    expect(()=>verifiedProvenance({...human,runner:'playwright'},'CONTROLLED')).toThrow('RUNNER_CANNOT_ATTEST_HUMAN');
    expect(verifiedProvenance(human,'CONTROLLED').executionClass).toBe('HUMAN_OPERATED'); // Schema fixture only, not a human-study result.
  });
  it('sensor session projection cannot expose truth from a privileged record', () => {
    const s={id:randomUUID(),expiresAt:new Date(0),attempt:{id:randomUUID(),runId:randomUUID(),executionClass:'HUMAN_OPERATED',provenance:{secret:'private'}}};
    expect(Object.keys(publicSession(s))).toEqual(['session_id','run_id','attempt_id','expires_at']);expect(JSON.stringify(publicSession(s))).not.toContain('HUMAN');
  });
  it('binding rejects injected labels and requires an independent operation identity for effects/replays', () => {
    const input={attempt_id:randomUUID(),source_service:'hmrc',source_event_id:randomUUID(),effect_class:'REPLAY'};
    expect(()=>bindingInput(input)).toThrow('OPERATION_ID_REQUIRED');expect(()=>bindingInput({...input,operation_id:randomUUID(),execution_class:'HUMAN_OPERATED'})).toThrow('UNEXPECTED_FIELD');
  });
  it('deduplicates repeated ingestion and distinguishes requests, unique operations and replays', () => {
    const op=randomUUID();const first={eventKind:'service_request',sourceService:'hmrc',sourceEventId:randomUUID(),operationId:op,effectClass:'UNIQUE_OPERATION'};
    const retry={...first,sourceEventId:randomUUID(),effectClass:'REPLAY'};
    const read={...first,sourceEventId:randomUUID(),operationId:null,effectClass:'REQUEST_ONLY'};
    const delegate={...read,sourceService:'delegate',sourceEventId:randomUUID()};
    expect(counts([first,first,retry,read,delegate])).toEqual({requests:3,unique_service_operations:1,replays:1,refusals:0});
  });
  it('requires an ingested source class and independent effect evidence, without turning signatures into truth', () => {
    const id=randomUUID(); const data=bindingInput({attempt_id:randomUUID(),source_service:'hmrc',source_event_id:id,effect_class:'UNIQUE_OPERATION',operation_id:randomUUID(),effect_evidence_digest:trace.trace_digest});
    const snapshot={source_service:'hmrc',source_event_id:id,event_kind:'service_request',outcome:{decision:'ALLOW',outcome_class:{value:'UNIQUE_OPERATION'},cost_class:{value:'write'}},observed:{lane:'SIGNED_AGENT',signature_verified:{value:true}}};
    expect(()=>validateBindingAgainstSource(data,snapshot,{status:'PLANNED',provenance:{}})).toThrow('INDEPENDENT_EFFECT_EVIDENCE_REQUIRED');
    expect(()=>validateBindingAgainstSource({...data,effectClass:'REPLAY'},snapshot,{status:'VERIFIED',provenance:trace})).toThrow('SOURCE_EFFECT_CLASS_MISMATCH');
    expect(()=>validateBindingAgainstSource(data,{...snapshot,source_event_id:randomUUID()},{status:'VERIFIED',provenance:trace})).toThrow('SOURCE_ID_MISMATCH');
    expect(validateBindingAgainstSource(data,snapshot,{status:'VERIFIED',provenance:trace})).toEqual({eventKind:'service_request',identityObservation:snapshot.observed});
  });

});
