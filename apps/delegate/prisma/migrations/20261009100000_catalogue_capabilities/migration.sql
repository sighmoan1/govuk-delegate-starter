ALTER TABLE capability ADD COLUMN catalogue_id TEXT, ADD COLUMN metadata JSONB;
DROP INDEX capability_service_id_code_key;
CREATE UNIQUE INDEX capability_catalogue_id_code_key ON capability(catalogue_id, code);
CREATE UNIQUE INDEX capability_legacy_service_code_key ON capability(service_id, code) WHERE catalogue_id IS NULL;
ALTER TABLE capability ADD CONSTRAINT capability_catalogue_id_fkey FOREIGN KEY (catalogue_id) REFERENCES service_catalogue(id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Publications made before capability materialisation retain their version and digest.
INSERT INTO capability (id,service_id,catalogue_id,code,name,risk_level,requires_step_up,sort_order,metadata)
SELECT gen_random_uuid()::text,s.service_id,s.id,c.value->>'code',c.value->>'name',
 (c.value->>'risk')::"RiskLevel",(c.value->>'requires_step_up')::boolean,c.ordinality-1,c.value
FROM service_catalogue s CROSS JOIN LATERAL jsonb_array_elements(s.document->'capabilities') WITH ORDINALITY c(value,ordinality);
