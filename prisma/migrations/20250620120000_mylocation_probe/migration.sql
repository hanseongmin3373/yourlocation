-- mylocation 조회 시도 캐시 (실패 IP 재조회 방지)
CREATE TABLE "MylocationProbe" (
    "ip" TEXT NOT NULL,
    "hit" BOOLEAN NOT NULL,
    "address" TEXT,
    "probedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MylocationProbe_pkey" PRIMARY KEY ("ip")
);

CREATE INDEX "MylocationProbe_probedAt_idx" ON "MylocationProbe"("probedAt");
