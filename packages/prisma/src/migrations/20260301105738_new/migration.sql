-- CreateTable
CREATE TABLE "GuildTrackHistory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildTrackHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuildTrackHistory_guildId_createdAt_idx" ON "GuildTrackHistory"("guildId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "GuildTrackHistory" ADD CONSTRAINT "GuildTrackHistory_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildTrackHistory" ADD CONSTRAINT "GuildTrackHistory_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildTrackHistory" ADD CONSTRAINT "GuildTrackHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
