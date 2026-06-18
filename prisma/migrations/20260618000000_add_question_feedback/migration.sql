-- CreateTable
CREATE TABLE "QuestionFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "feedback" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "QuestionFeedback_userId_idx" ON "QuestionFeedback"("userId");

-- CreateIndex
CREATE INDEX "QuestionFeedback_createdAt_idx" ON "QuestionFeedback"("createdAt");
