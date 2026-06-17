import type { Card } from "@prisma/client";

export type YesNoUnknown = "yes" | "no" | "unknown";

export interface AnswerResult {
  answer: YesNoUnknown;
  reason: string;
}

/**
 * Strategy interface for answering yes/no questions about a card.
 *
 * The current implementation is {@link RuleBasedQuestionAnswerer}.
 * A future `ClaudeQuestionAnswerer` can implement the same interface
 * and be swapped in without touching the quiz logic.
 */
export interface QuestionAnswerer {
  answer(card: Card, question: string): Promise<AnswerResult>;
}
