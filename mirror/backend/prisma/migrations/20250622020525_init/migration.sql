-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "input" INTEGER NOT NULL,
    "output" INTEGER NOT NULL,
    "cost" TEXT NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageRecord_channelId_idx" ON "UsageRecord"("channelId");
