CREATE TABLE "ProviderConnection" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "apiBaseUrl" TEXT,
  "apiKey" TEXT,
  "apiSecret" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "lastTestedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderConnection_providerId_key" ON "ProviderConnection"("providerId");

ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;