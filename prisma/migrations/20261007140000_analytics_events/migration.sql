CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerCode" TEXT,
  "rideType" TEXT,
  "pickup" TEXT,
  "destination" TEXT,
  "city" TEXT,
  "sessionKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_eventType_createdAt_idx" ON "AnalyticsEvent"("eventType", "createdAt");
CREATE INDEX "AnalyticsEvent_providerCode_createdAt_idx" ON "AnalyticsEvent"("providerCode", "createdAt");
CREATE INDEX "AnalyticsEvent_rideType_createdAt_idx" ON "AnalyticsEvent"("rideType", "createdAt");
CREATE INDEX "AnalyticsEvent_city_createdAt_idx" ON "AnalyticsEvent"("city", "createdAt");