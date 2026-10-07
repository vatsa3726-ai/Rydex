CREATE TYPE "PartnerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PartnerApplication" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "website" TEXT,
  "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rideTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "integrationType" TEXT NOT NULL DEFAULT 'BOOKING_LINK',
  "notes" TEXT,
  "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "providerCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerApplication_status_idx" ON "PartnerApplication"("status");
CREATE INDEX "PartnerApplication_createdAt_idx" ON "PartnerApplication"("createdAt");