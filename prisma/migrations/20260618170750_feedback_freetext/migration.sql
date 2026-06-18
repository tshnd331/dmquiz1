/*
  Warnings:

  - You are about to drop the column `botAnswer` on the `QuestionFeedback` table. All the data in the column will be lost.
  - You are about to drop the column `question` on the `QuestionFeedback` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `QuestionFeedback` table. All the data in the column will be lost.
  - You are about to drop the column `userCorrectAnswer` on the `QuestionFeedback` table. All the data in the column will be lost.
  - Added the required column `content` to the `QuestionFeedback` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuestionFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cardId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "issueNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionFeedback_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuestionFeedback" ("cardId", "createdAt", "id", "issueNumber", "status", "updatedAt", "userId") SELECT "cardId", "createdAt", "id", "issueNumber", "status", "updatedAt", "userId" FROM "QuestionFeedback";
DROP TABLE "QuestionFeedback";
ALTER TABLE "new_QuestionFeedback" RENAME TO "QuestionFeedback";
CREATE INDEX "QuestionFeedback_cardId_idx" ON "QuestionFeedback"("cardId");
CREATE INDEX "QuestionFeedback_userId_idx" ON "QuestionFeedback"("userId");
CREATE INDEX "QuestionFeedback_status_idx" ON "QuestionFeedback"("status");
CREATE INDEX "QuestionFeedback_createdAt_idx" ON "QuestionFeedback"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
