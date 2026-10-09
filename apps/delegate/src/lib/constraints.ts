import { DomainError } from "./requests";
import type { CatalogueCapability } from "./catalogues";
/** Bounded enum sets only. No executable expressions, free-text policies or domain interpretation. */
export type Constraints = Record<string, Record<string, string[]>>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bad = (): never => { throw new DomainError("CONSTRAINTS_INVALID", "Restrictions must be supported, nonempty enum sets within the requested permission", 400); };
export function validateConstraints(value: unknown, capabilities: CatalogueCapability[]): Constraints {
 if(value === undefined || value === null) return {};
 if(!object(value) || JSON.stringify(value).length > 8192 || Object.keys(value).length>64) return bad();
 const result: Constraints = Object.create(null);
 for(const [cap,fields] of Object.entries(value)) {
  const definition = capabilities.find(c=>c.code===cap);
  if(["__proto__","constructor","prototype"].includes(cap) || !definition || !object(fields) || !Object.keys(fields).length || Object.keys(fields).length>8) return bad();
  result[cap]=Object.create(null);
  for(const [field,values] of Object.entries(fields)) {
   if(["__proto__","constructor","prototype"].includes(field)) return bad();
   const rule=definition.supported_constraints && Object.hasOwn(definition.supported_constraints,field)?definition.supported_constraints[field]:undefined;
   if(!rule || rule.type!=="enum" || !Array.isArray(values) || !values.length || values.length>32 || values.some(v=>typeof v!=="string" || !rule.values.includes(v)) || new Set(values).size!==values.length) return bad();
   result[cap][field]=[...values].sort();
  }
 }
 return result;
}
export function narrowConstraints(parent: Constraints, child: Constraints, capabilities: string[]): Constraints {
 for(const [cap,fields] of Object.entries(parent)) {
  if(!capabilities.includes(cap)) continue;
  for(const [key,values] of Object.entries(fields)) {
   const narrowed=child[cap]?.[key];
   if(!narrowed || !narrowed.length || narrowed.some(v=>!values.includes(v))) return bad();
  }
 }
 if(Object.keys(child).some(cap=>!capabilities.includes(cap))) return bad();
 return child;
}
export function selectConstraints(value: Constraints, capabilities: string[]): Constraints {
 return Object.fromEntries(Object.entries(value).filter(([cap])=>capabilities.includes(cap)));
}
/** Live ancestor narrowing binds all descendants, including ones created before a narrowing. */
export function intersectConstraints(a: Constraints, b: Constraints, capability: string): Constraints {
 const fields: Record<string,string[]>={};
 for(const key of new Set([...Object.keys(a[capability]??{}),...Object.keys(b[capability]??{})])) {
  const x=a[capability]?.[key], y=b[capability]?.[key];
  const values=x&&y?x.filter(v=>y.includes(v)):(x??y)!;
  if(!values.length) return bad();
  fields[key]=values;
 }
 return Object.keys(fields).length?{[capability]:fields}:{};
}
export function constraintsFromForm(form: {getAll(name:string):unknown[]}, requested: Constraints, selected: string[]): Constraints {
 const result: Constraints={};
 for(const [cap,fields] of Object.entries(requested)) if(selected.includes(cap)) {
  result[cap]=Object.create(null);
  for(const key of Object.keys(fields)) result[cap][key]=form.getAll(`restriction:${cap}:${key}`).map(String);
 }
 return narrowConstraints(requested,result,selected);
}
