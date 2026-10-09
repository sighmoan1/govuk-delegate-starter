CREATE TABLE "service_catalogue" (
 "id" TEXT NOT NULL, "service_id" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "digest" TEXT NOT NULL, "document" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "service_catalogue_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "service_catalogue_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_catalogue_service_id_version_key" ON "service_catalogue"("service_id", "version");
CREATE FUNCTION protect_service_catalogue() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Published catalogues are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER service_catalogue_immutable BEFORE UPDATE OR DELETE ON "service_catalogue" FOR EACH ROW EXECUTE FUNCTION protect_service_catalogue();
