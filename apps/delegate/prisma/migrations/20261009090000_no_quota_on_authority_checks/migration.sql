-- A Delegate authority check proves identity + live mandate + capability. It no
-- longer spends a per-person quota, so the counter table, the per-service limit
-- and the per-event capacity snapshot go. (The CAPACITY_EXCEEDED enum value stays
-- so historical activity rows still read; Delegate no longer issues it.)
DROP TABLE "capacity_use";
ALTER TABLE "service" DROP COLUMN "principal_actions_per_hour";
ALTER TABLE "activity_event" DROP COLUMN "capacity_used", DROP COLUMN "capacity_limit";
