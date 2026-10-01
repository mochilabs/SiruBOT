-- CreateEnum (none)

-- CreateTable
CREATE TABLE "ChannelChatHistory" (
    "channelId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelChatHistory_pkey" PRIMARY KEY ("channelId")
);
