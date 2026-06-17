import type { ChatInputCommandInteraction } from "discord.js";
import type { QuizManager } from "../quiz/QuizManager.js";
import {
  MAX_QUESTIONS,
  MAX_WRONG,
  type QuizSession,
} from "../quiz/QuizSession.js";
import { logger } from "../utils/logger.js";

const ANSWER_LABEL: Record<string, string> = {
  yes: "はい",
  no: "いいえ",
  unknown: "判断不能",
};

/** Route a slash command interaction to the right handler. */
export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
): Promise<void> {
  const channelId = interaction.channelId;
  try {
    switch (interaction.commandName) {
      case "dmquiz_start":
        return await handleStart(interaction, manager, channelId);
      case "dmquiz_ask":
        return await handleAsk(interaction, manager, channelId);
      case "dmquiz_guess":
        return await handleGuess(interaction, manager, channelId);
      case "dmquiz_status":
        return await handleStatus(interaction, manager, channelId);
      case "dmquiz_giveup":
        return await handleGiveup(interaction, manager, channelId);
      default:
        await interaction.reply({ content: "未知のコマンドです。", ephemeral: true });
    }
  } catch (err) {
    logger.error("Interaction handler failed:", err);
    const msg = "内部エラーが発生しました。";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
}

async function handleStart(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
  channelId: string,
): Promise<void> {
  if (manager.has(channelId)) {
    await interaction.reply(
      "このチャンネルでは既にクイズが進行中です。`/dmquiz_status` で状況を確認するか、`/dmquiz_giveup` で終了してください。",
    );
    return;
  }

  const session = await manager.start(channelId);
  if (!session) {
    await interaction.reply(
      "カードがDBにありません。`npm run seed` でサンプル投入するか、`npm run crawl` で取得してください。",
    );
    return;
  }

  await interaction.reply(
    [
      "🃏 **デュエマ当てクイズ開始！**",
      `ランダムに選ばれた1枚を当ててください。`,
      "",
      `- \`/dmquiz_ask\` で質問（最大 ${MAX_QUESTIONS} 回。質問するたび回答権 +1）`,
      "- `/dmquiz_guess` でカード名を回答（回答権を1消費）",
      `- 不正解が ${MAX_WRONG} 回で敗北`,
      "- `/dmquiz_status` で状況確認 / `/dmquiz_giveup` で答え表示",
    ].join("\n"),
  );
}

async function handleAsk(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
  channelId: string,
): Promise<void> {
  const session = manager.get(channelId);
  if (!session) {
    await interaction.reply(noSessionMessage());
    return;
  }

  const question = interaction.options.getString("question", true);
  const reg = session.registerQuestion();
  if (!reg.ok) {
    await interaction.reply(
      `質問は最大 ${MAX_QUESTIONS} 回までです。これ以上質問できません。\`/dmquiz_guess\` で回答してください。`,
    );
    return;
  }

  // Answering may be async (future Claude answerer), so defer.
  await interaction.deferReply();
  const result = await manager.answerQuestion(session, question);
  const label = ANSWER_LABEL[result.answer] ?? result.answer;

  await interaction.editReply(
    [
      `❓ **質問:** ${truncate(question, 200)}`,
      `💬 **回答:** ${label}`,
      "",
      `（質問 ${reg.questionCount}/${MAX_QUESTIONS}・回答権 ${reg.answerCredits}）`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function handleGuess(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
  channelId: string,
): Promise<void> {
  const session = manager.get(channelId);
  if (!session) {
    await interaction.reply(noSessionMessage());
    return;
  }

  const guess = interaction.options.getString("card_name", true);
  const result = session.submitGuess(guess);

  if (!result.ok) {
    await interaction.reply(
      "回答権がありません。先に `/dmquiz_ask` で質問して回答権を獲得してください。",
    );
    return;
  }

  if (result.correct) {
    manager.end(channelId);
    await interaction.reply(
      [
        `🎉 **正解！** 「${session.card.name}」でした。`,
        cardSummary(session),
        `（質問 ${session.questionCount} 回・不正解 ${session.wrongCount} 回で勝利）`,
      ].join("\n"),
    );
    return;
  }

  if (result.finished) {
    manager.end(channelId);
    await interaction.reply(
      [
        `❌ 不正解。不正解が ${MAX_WRONG} 回に達したため **敗北** です。`,
        `正解は「${session.card.name}」でした。`,
        cardSummary(session),
      ].join("\n"),
    );
    return;
  }

  await interaction.reply(
    [
      `❌ 「${truncate(guess, 100)}」は不正解です。`,
      `（不正解 ${result.wrongCount}/${MAX_WRONG}・残り回答権 ${result.answerCredits}）`,
    ].join("\n"),
  );
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
  channelId: string,
): Promise<void> {
  const session = manager.get(channelId);
  if (!session) {
    await interaction.reply(noSessionMessage());
    return;
  }

  await interaction.reply(
    [
      "📊 **現在の状況**",
      `- 質問回数: ${session.questionCount}/${MAX_QUESTIONS}（残り ${session.questionsRemaining}）`,
      `- 回答権: ${session.answerCredits}`,
      `- 不正解回数: ${session.wrongCount}/${MAX_WRONG}（残り ${session.wrongRemaining}）`,
    ].join("\n"),
  );
}

async function handleGiveup(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
  channelId: string,
): Promise<void> {
  const session = manager.get(channelId);
  if (!session) {
    await interaction.reply(noSessionMessage());
    return;
  }

  session.giveUp();
  manager.end(channelId);
  await interaction.reply(
    [
      `🏳️ ギブアップ。正解は「${session.card.name}」でした。`,
      cardSummary(session),
    ].join("\n"),
  );
}

// --- helpers ------------------------------------------------------------

function noSessionMessage(): string {
  return "このチャンネルでクイズは開始されていません。`/dmquiz_start` で開始してください。";
}

function cardSummary(session: QuizSession): string {
  const c = session.card;
  const parts = [
    c.civilization ? `文明: ${c.civilization}` : null,
    c.cost !== null && c.cost !== undefined ? `コスト: ${c.cost}` : null,
    c.cardType ? `種別: ${c.cardType}` : null,
    c.race ? `種族: ${c.race}` : null,
    c.power ? `パワー: ${c.power}` : null,
  ].filter(Boolean);
  const line = parts.length ? `> ${parts.join(" / ")}` : "";
  const url = c.sourceUrl ? `> ${c.sourceUrl}` : "";
  return [line, url].filter(Boolean).join("\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
