-- CreateTable
CREATE TABLE IF NOT EXISTS "IpLocationEntry" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "ipPrefix24" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "appliedAddress" TEXT NOT NULL DEFAULT '',
    "dong" TEXT,
    "sido" TEXT,
    "sigungu" TEXT,
    "roadAddress" TEXT,
    "isp" TEXT,
    "lookupCount" INTEGER NOT NULL DEFAULT 0,
    "registerCount" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'gps-register',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpLocationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IpLocationEntry_ip_key" ON "IpLocationEntry"("ip");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IpLocationEntry_ipPrefix24_idx" ON "IpLocationEntry"("ipPrefix24");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IpLocationEntry_updatedAt_idx" ON "IpLocationEntry"("updatedAt" DESC);
