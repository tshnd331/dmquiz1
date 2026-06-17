-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "civilization" TEXT,
    "cost" INTEGER,
    "cardType" TEXT,
    "race" TEXT,
    "power" TEXT,
    "text" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CrawlTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_name_key" ON "Card"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Card_sourceUrl_key" ON "Card"("sourceUrl");

-- CreateIndex
CREATE INDEX "Card_civilization_idx" ON "Card"("civilization");

-- CreateIndex
CREATE INDEX "Card_cardType_idx" ON "Card"("cardType");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlTarget_url_key" ON "CrawlTarget"("url");

-- CreateIndex
CREATE INDEX "CrawlTarget_type_status_idx" ON "CrawlTarget"("type", "status");
