ALTER TABLE "PartnerApplication" ADD COLUMN "partnerPassword" TEXT;
CREATE TABLE "PartnerSession" ("id" TEXT NOT NULL,"applicationId" TEXT NOT NULL,"token" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PartnerSession_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PartnerSession_token_key" ON "PartnerSession"("token");
CREATE INDEX "PartnerSession_applicationId_idx" ON "PartnerSession"("applicationId");
CREATE INDEX "PartnerSession_expiresAt_idx" ON "PartnerSession"("expiresAt");