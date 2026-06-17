import type { Card } from "@prisma/client";

export const MAX_QUESTIONS = 10;
export const MAX_ANSWER_CREDITS = 10;
export const MAX_WRONG = 10;

export type QuizOutcome = "won" | "lost" | "gaveup";

export interface AskResult {
  ok: boolean;
  /** Present when ok === false. */
  reason?: "max_questions";
  questionCount: number;
  answerCredits: number;
}

export interface GuessResult {
  ok: boolean;
  /** Present when ok === false (no credit to spend). */
  reason?: "no_credit";
  correct?: boolean;
  finished?: boolean;
  outcome?: QuizOutcome;
  wrongCount: number;
  answerCredits: number;
}

/**
 * Holds the state of a single quiz running in one Discord channel.
 *
 * Rules:
 * - Each question increments questionCount (max 10) and grants +1 answer
 *   credit (capped at 10).
 * - No questions allowed once questionCount reaches MAX_QUESTIONS.
 * - A guess spends one credit. Correct -> win. Wrong -> wrongCount += 1.
 * - wrongCount reaching MAX_WRONG -> loss.
 */
export class QuizSession {
  readonly card: Card;
  readonly channelId: string;
  readonly startedAt: Date;

  questionCount = 0;
  answerCredits = 0;
  wrongCount = 0;
  finished = false;
  outcome: QuizOutcome | null = null;

  constructor(channelId: string, card: Card) {
    this.channelId = channelId;
    this.card = card;
    this.startedAt = new Date();
  }

  get questionsRemaining(): number {
    return Math.max(0, MAX_QUESTIONS - this.questionCount);
  }

  get wrongRemaining(): number {
    return Math.max(0, MAX_WRONG - this.wrongCount);
  }

  /** Register that a question was asked. Returns whether it was allowed. */
  registerQuestion(): AskResult {
    if (this.finished || this.questionCount >= MAX_QUESTIONS) {
      return {
        ok: false,
        reason: "max_questions",
        questionCount: this.questionCount,
        answerCredits: this.answerCredits,
      };
    }
    this.questionCount += 1;
    this.answerCredits = Math.min(MAX_ANSWER_CREDITS, this.answerCredits + 1);
    return {
      ok: true,
      questionCount: this.questionCount,
      answerCredits: this.answerCredits,
    };
  }

  /** Apply a guess. The caller decides correctness via {@link matchesName}. */
  submitGuess(guess: string): GuessResult {
    if (this.finished) {
      return {
        ok: false,
        reason: "no_credit",
        wrongCount: this.wrongCount,
        answerCredits: this.answerCredits,
      };
    }
    if (this.answerCredits <= 0) {
      return {
        ok: false,
        reason: "no_credit",
        wrongCount: this.wrongCount,
        answerCredits: this.answerCredits,
      };
    }

    this.answerCredits -= 1;
    const correct = this.matchesName(guess);

    if (correct) {
      this.finished = true;
      this.outcome = "won";
      return {
        ok: true,
        correct: true,
        finished: true,
        outcome: "won",
        wrongCount: this.wrongCount,
        answerCredits: this.answerCredits,
      };
    }

    this.wrongCount += 1;
    const lost = this.wrongCount >= MAX_WRONG;
    if (lost) {
      this.finished = true;
      this.outcome = "lost";
    }
    return {
      ok: true,
      correct: false,
      finished: lost,
      outcome: lost ? "lost" : undefined,
      wrongCount: this.wrongCount,
      answerCredits: this.answerCredits,
    };
  }

  giveUp(): void {
    this.finished = true;
    this.outcome = "gaveup";
  }

  /** Lenient name comparison (NFKC, case-insensitive, ignore spaces/symbols). */
  matchesName(guess: string): boolean {
    return normalizeName(guess) === normalizeName(this.card.name);
  }
}

/** Normalise a card name for forgiving comparison. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･\-—–_,.、。!！?？「」『』()（）"'’”]/g, "")
    .trim();
}
