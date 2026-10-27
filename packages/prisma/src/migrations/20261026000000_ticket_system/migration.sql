-- CreateTable
CREATE TABLE IF NOT EXISTS "TicketConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "supportRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logChannelId" TEXT,
    "maxOpenPerUser" INTEGER NOT NULL DEFAULT 1,
    "panelChannelId" TEXT,
    "panelMessageId" TEXT,
    "panelTitle" TEXT NOT NULL DEFAULT '고객지원 티켓',
    "panelDescription" TEXT NOT NULL DEFAULT '아래 버튼을 눌러 담당자와 1:1 비공개 상담 채널을 개설해요.',
    "ticketCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "claimedById" TEXT,
    "closedById" TEXT,
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_guildId_ownerId_status_idx" ON "Ticket"("guildId", "ownerId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_guildId_fkey"
        FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey"
        FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
