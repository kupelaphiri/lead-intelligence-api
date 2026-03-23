ALTER TABLE "users"
ADD COLUMN "leadsUsedThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "currentPeriodStart" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "currentPeriodEnd" TIMESTAMPTZ(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

UPDATE "users"
SET
  "leadsUsedThisPeriod" = 0,
  "currentPeriodStart" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "currentPeriodEnd" = COALESCE("createdAt", CURRENT_TIMESTAMP) + INTERVAL '30 days'
WHERE "currentPeriodEnd" IS NULL;
