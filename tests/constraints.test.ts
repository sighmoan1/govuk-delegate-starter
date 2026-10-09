import { expect, it, vi } from "vitest";
vi.mock("@/lib/db",()=>({prisma:{}}));
import { validateConstraints, narrowConstraints, intersectConstraints, constraintsFromForm } from "@/lib/constraints";
import type { CatalogueCapability } from "@/lib/catalogues";
const cap: CatalogueCapability={code:"read_case",name:"Read case",description:"Synthetic",risk:"LOW",requires_step_up:false,minimum_assurance:"DECLARED",operation:{method:"GET",path:"/api/case"},supported_constraints:{case_ref:{type:"enum",values:["A","B"]}}};
const both={read_case:{case_ref:["A","B"]}},one={read_case:{case_ref:["A"]}};
it("validates bounded typed service-defined sets and canonicalises values",()=>{expect(validateConstraints(both,[cap])).toEqual(both);expect(validateConstraints(null,[cap])).toEqual({});});
it("fails closed for unknown/malicious fields, types, empty sets and duplicate values",()=>{for(const value of [{read_case:{other:["A"]}},{read_case:{case_ref:"A"}},{read_case:{case_ref:[]}},{read_case:{case_ref:["A","A"]}},{read_case:{case_ref:["<script>"]}},{write_case:{case_ref:["A"]}},"execute anything"]){expect(()=>validateConstraints(value,[cap])).toThrow();}});
it("citizen and children may narrow, cannot widen or omit inherited restriction",()=>{expect(narrowConstraints(both,one,[cap.code])).toEqual(one);expect(()=>narrowConstraints(one,both,[cap.code])).toThrow();expect(()=>narrowConstraints(one,{},[cap.code])).toThrow();expect(()=>narrowConstraints({},one,[])).toThrow();});
it("live ancestors intersect narrower children and fail closed on disjoint values",()=>{expect(intersectConstraints(both,one,cap.code)).toEqual(one);expect(()=>intersectConstraints(one,{read_case:{case_ref:["B"]}},cap.code)).toThrow();});
it("browser selection preserves only selected values and rejects removal of every value",()=>{const form=new FormData();form.append("restriction:read_case:case_ref","A");expect(constraintsFromForm(form,both,[cap.code])).toEqual(one);expect(()=>constraintsFromForm(new FormData(),both,[cap.code])).toThrow();});

it("rejects JSON prototype-sensitive keys without changing dictionary prototypes",()=>{for(const raw of ['{"read_case":{"__proto__":["A"]}}','{"read_case":{"constructor":["A"]}}','{"constructor":{"case_ref":["A"]}}']) expect(()=>validateConstraints(JSON.parse(raw),[cap])).toThrow();});
