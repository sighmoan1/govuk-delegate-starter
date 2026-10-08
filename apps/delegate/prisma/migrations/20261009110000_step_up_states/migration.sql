-- Issue #19. New values first, in a migration of their own: Postgres will not let
-- a statement use an enum value added in the same transaction.
ALTER TYPE "StepUpStatus" ADD VALUE 'RESERVED';
ALTER TYPE "StepUpStatus" ADD VALUE 'DECLINED';
ALTER TYPE "StepUpStatus" ADD VALUE 'EXPIRED';
