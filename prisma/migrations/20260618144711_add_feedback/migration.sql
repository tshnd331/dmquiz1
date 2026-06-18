-- CreateTable
CREATE TABLE "QuestionFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cardId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "botAnswer" TEXT NOT NULL,
    "userCorrectAnswer" TEXT,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "issueNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionFeedback_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionPattern" TEXT NOT NULL,
    "ruleCategory" TEXT NOT NULL,
    "totalFeedback" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" REAL NOT NULL,
    "lastUpdated" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "QuestionFeedback_cardId_idx" ON "QuestionFeedback"("cardId");

-- CreateIndex
CREATE INDEX "QuestionFeedback_userId_idx" ON "QuestionFeedback"("userId");

-- CreateIndex
CREATE INDEX "QuestionFeedback_status_idx" ON "QuestionFeedback"("status");

-- CreateIndex
CREATE INDEX "QuestionFeedback_createdAt_idx" ON "QuestionFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackStats_questionPattern_ruleCategory_key" ON "FeedbackStats"("questionPattern", "ruleCategory");
