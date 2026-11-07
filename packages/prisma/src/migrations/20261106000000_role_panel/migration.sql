-- CreateTable
CREATE TABLE IF NOT EXISTS "RolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RolePanelButton" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "style" TEXT NOT NULL DEFAULT 'secondary',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RolePanelButton_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RolePanel_guildId_idx" ON "RolePanel"("guildId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RolePanelButton_panelId_idx" ON "RolePanelButton"("panelId");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "RolePanel" ADD CONSTRAINT "RolePanel_guildId_fkey"
        FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "RolePanelButton" ADD CONSTRAINT "RolePanelButton_panelId_fkey"
        FOREIGN KEY ("panelId") REFERENCES "RolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
