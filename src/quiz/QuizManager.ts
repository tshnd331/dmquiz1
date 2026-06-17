import type { Card } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { QuizSession } from "./QuizSession.js";
import type { QuestionAnswerer } from "./QuestionAnswerer.js";

/**
 * Owns all active quiz sessions, keyed by Discord channel id, and wires
 * sessions to the configured {@link QuestionAnswerer}.
 */
export class QuizManager {
  private sessions = new Map<string, QuizSession>();

  constructor(private readonly answerer: QuestionAnswerer) {}

  get(channelId: string): QuizSession | undefined {
    return this.sessions.get(channelId);
  }

  has(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  end(channelId: string): void {
    this.sessions.delete(channelId);
  }

  /**
   * Start a new quiz in the channel by picking a random card from the DB.
   * Returns null if no cards exist or a session is already running.
   */
  async start(channelId: string): Promise<QuizSession | null> {
    if (this.sessions.has(channelId)) return null;
    const card = await pickRandomCard();
    if (!card) return null;
    const session = new QuizSession(channelId, card);
    this.sessions.set(channelId, session);
    return session;
  }

  /** Delegate to the answerer for the active session's card. */
  answerQuestion(session: QuizSession, question: string) {
    return this.answerer.answer(session.card, question);
  }
}

/** Pick a uniformly random card using count + skip (works on SQLite). */
export async function pickRandomCard(): Promise<Card | null> {
  const count = await prisma.card.count();
  if (count === 0) return null;
  const skip = Math.floor(Math.random() * count);
  const cards = await prisma.card.findMany({ take: 1, skip });
  return cards[0] ?? null;
}
