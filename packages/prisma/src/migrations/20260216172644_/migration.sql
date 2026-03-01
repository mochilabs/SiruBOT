-- CreateTable
CREATE TABLE "public"."Guild" (
    "id" TEXT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 10,
    "textChannelId" TEXT,
    "voiceChannelId" TEXT,
    "enableController" BOOLEAN NOT NULL DEFAULT true,
    "sponsorBlockSegments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "djRoleId" TEXT,
    "repeat" TEXT NOT NULL DEFAULT 'off',
    "related" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Track" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "thumbnail" TEXT,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "totalPlays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFavorite" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateIndex
CREATE INDEX "UserFavorite_trackId_idx" ON "public"."UserFavorite"("trackId");

-- AddForeignKey
ALTER TABLE "public"."UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFavorite" ADD CONSTRAINT "UserFavorite_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
