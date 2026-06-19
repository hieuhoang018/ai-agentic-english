-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "ScheduledReminderRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledReminderRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledReminderRun_userId_reminderType_runDate_key" ON "ScheduledReminderRun"("userId", "reminderType", "runDate");
