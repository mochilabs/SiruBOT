-- CreateTable
CREATE TABLE "GuildAsset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuildAsset_guildId_createdAt_idx" ON "GuildAsset"("guildId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GuildAsset_bucket_key_key" ON "GuildAsset"("bucket", "key");

-- AddForeignKey
ALTER TABLE "GuildAsset" ADD CONSTRAINT "GuildAsset_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
