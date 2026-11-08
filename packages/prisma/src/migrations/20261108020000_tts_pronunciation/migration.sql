-- CreateTable
CREATE TABLE "TtsPronunciation" (
    "guildId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TtsPronunciation_pkey" PRIMARY KEY ("guildId","term")
);
