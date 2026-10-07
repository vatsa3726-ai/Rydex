-- Rydex security/provider schema repair
ALTER TABLE "Provider"
  ADD COLUMN IF NOT EXISTS "liveApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "liveApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "liveError" TEXT;

ALTER TABLE "PartnerApplication"
  ADD COLUMN IF NOT EXISTS "partnerPasswordHash" TEXT;

-- Do not retain legacy plaintext partner credentials.
UPDATE "PartnerApplication" SET "partnerPasswordHash" = NULL;
ALTER TABLE "PartnerApplication" DROP COLUMN IF EXISTS "partnerPassword";

DO $
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PartnerSession' AND column_name = 'token')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PartnerSession' AND column_name = 'tokenHash') THEN
    ALTER TABLE "PartnerSession" RENAME COLUMN "token" TO "tokenHash";
  END IF;
END $;

CREATE TABLE IF NOT EXISTS "ProviderConnection" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "apiBaseUrl" TEXT,
  "apiKey" TEXT,
  "apiSecret" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "lastTestedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConnection_providerId_key" ON "ProviderConnection"("providerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderConnection_providerId_fkey'
  ) THEN
    ALTER TABLE "ProviderConnection"
      ADD CONSTRAINT "ProviderConnection_providerId_fkey"
      FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PartnerSession" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PartnerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerSession_tokenHash_key" ON "PartnerSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "PartnerSession_applicationId_idx" ON "PartnerSession"("applicationId");
CREATE INDEX IF NOT EXISTS "PartnerSession_expiresAt_idx" ON "PartnerSession"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PartnerSession_applicationId_fkey'
  ) THEN
    ALTER TABLE "PartnerSession"
      ADD CONSTRAINT "PartnerSession_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
