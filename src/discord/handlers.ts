import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type SendableChannels,
} from "discord.js";
import type { QuizManager } from "../quiz/QuizManager.js";
import {
  MAX_QUESTIONS,
  MAX_WRONG,
  type QuizSession,
} from "../quiz/QuizSession.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { prisma } from "../db/prisma.js";
import {
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  createFeedbackIssue,
} from "../github/issues.js";

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
      case "dmquiz_feedback":
        return await handleFeedback(interaction, manager, channelId);
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

const FEEDBACK_BUTTON_PREFIX = "fb_";

async function handleFeedback(
  interaction: ChatInputCommandInteraction,
  manager: QuizManager,
  channelId: string,
): Promise<void> {
  // Feedback can be sent with or without an active quiz. If a quiz is in
  // progress, the feedback is linked to the current card; otherwise it is a
  // general feedback with no card association.
  const session = manager.get(channelId);

  if (!config.adminChannelId || !config.githubToken) {
    logger.warn(
      "Feedback received but ADMIN_CHANNEL_ID or GITHUB_TOKEN is not configured.",
    );
    await interaction.reply({
      content: "フィードバック機能は管理者により未設定です。受付できませんでした。",
      ephemeral: true,
    });
    return;
  }

  const content = interaction.options.getString("content", true);

  await interaction.deferReply({ ephemeral: true });

  const fb = await prisma.questionFeedback.create({
    data: {
      cardId: session?.card?.id ?? null,
      content,
      userId: interaction.user.id,
      status: "pending",
    },
  });

  // Post the admin approval embed + buttons to the admin channel.
  const channel = await interaction.client.channels
    .fetch(config.adminChannelId)
    .catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    logger.error("Admin channel not found or not sendable:", config.adminChannelId);
    await interaction.editReply(
      "フィードバックを保存しましたが、管理者チャンネルへの通知に失敗しました。",
    );
    return;
  }

  const embed = buildFeedbackEmbed(fb, session?.card?.name ?? null);
  const row = buildFeedbackButtons(fb.id);
  await (channel as SendableChannels).send({ embeds: [embed], components: [row] });

  await interaction.editReply(
    "✅ フィードバックありがとうございます！（管理者の確認後に対応されます）",
  );
}

/** Route a button interaction; only feedback approve/reject is handled. */
export async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.customId.startsWith(FEEDBACK_BUTTON_PREFIX)) return;

  // Only process feedback buttons in the configured admin channel; a button
  // copied/reposted elsewhere must not be actionable.
  if (!config.adminChannelId || interaction.channelId !== config.adminChannelId) {
    await interaction.reply({
      content: "このボタンは管理者チャンネルでのみ操作できます。",
      ephemeral: true,
    });
    return;
  }

  try {
    const [action, idStr] = interaction.customId.split(":");
    const feedbackId = Number(idStr);
    if (!Number.isInteger(feedbackId)) {
      await interaction.reply({ content: "不正なボタンです。", ephemeral: true });
      return;
    }

    if (action === "fb_approve" && !config.githubToken) {
      await interaction.reply({
        content: "GITHUB_TOKEN が未設定のため Issue を作成できません。",
        ephemeral: true,
      });
      return;
    }

    // Both approve and reject open a modal so the admin can attach an optional
    // comment. The actual DB claim / Issue creation happens on modal submit so
    // that cancelling the modal leaves the feedback untouched (no processing
    // row left stranded).
    if (action === "fb_approve" || action === "fb_reject") {
      await interaction.showModal(buildFeedbackCommentModal(action, feedbackId));
      return;
    }

    // Unknown action under the feedback prefix: respond explicitly so the
    // interaction never fails silently on Discord's side.
    await interaction.reply({
      content: "不明な操作です。",
      ephemeral: true,
    });
  } catch (err) {
    logger.error("Button interaction handler failed:", err);
    const msg = "処理中にエラーが発生しました。";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
}

/**
 * Handle the comment modal submitted from an approve/reject button. This is
 * where the feedback row is atomically claimed and, on approval, the GitHub
 * Issue is created — including the admin's optional comment.
 */
export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.customId.startsWith(FEEDBACK_BUTTON_PREFIX)) return;

  if (!config.adminChannelId || interaction.channelId !== config.adminChannelId) {
    await interaction.reply({
      content: "この操作は管理者チャンネルでのみ実行できます。",
      ephemeral: true,
    });
    return;
  }

  try {
    const [action, idStr] = interaction.customId.split(":");
    const feedbackId = Number(idStr);
    if (!Number.isInteger(feedbackId)) {
      await interaction.reply({ content: "不正な操作です。", ephemeral: true });
      return;
    }

    const raw = interaction.fields.getTextInputValue("comment").trim();
    const comment = raw.length > 0 ? raw : null;

    if (action === "fb_reject_modal") {
      // Atomically claim the pending row so a concurrent action can't also act.
      const claim = await prisma.questionFeedback.updateMany({
        where: { id: feedbackId, status: "pending" },
        data: { status: "rejected", adminComment: comment },
      });
      if (claim.count !== 1) {
        await reportNotClaimable(interaction, feedbackId);
        return;
      }
      await interaction.deferUpdate();
      const embeds = buildFinalEmbeds(interaction, 0x95a5a6, comment);
      await interaction.editReply({
        content: "❌ 却下（修正しない）",
        components: [],
        ...(embeds ? { embeds } : {}),
      });
      return;
    }

    if (action === "fb_approve_modal") {
      if (!config.githubToken) {
        await interaction.reply({
          content: "GITHUB_TOKEN が未設定のため Issue を作成できません。",
          ephemeral: true,
        });
        return;
      }

      // Atomically claim pending → processing so simultaneous approvals by
      // multiple admins can't create duplicate Issues. Only the winner (count
      // === 1) proceeds to the GitHub API call.
      const claim = await prisma.questionFeedback.updateMany({
        where: { id: feedbackId, status: "pending" },
        data: { status: "processing" },
      });
      if (claim.count !== 1) {
        await reportNotClaimable(interaction, feedbackId);
        return;
      }

      const fb = await prisma.questionFeedback.findUnique({
        where: { id: feedbackId },
        include: { card: true },
      });
      if (!fb) {
        // Should not happen (we just claimed it), but stay defensive.
        await interaction.reply({
          content: "対象のフィードバックが見つかりません。",
          ephemeral: true,
        });
        return;
      }

      // ACK within 3s before the GitHub API call, which can exceed the
      // interaction timeout; finalize the message with editReply afterwards.
      await interaction.deferUpdate();
      const cardName = fb.card?.name ?? null;
      let issueNumber: number;
      try {
        issueNumber = await createFeedbackIssue({
          repo: config.githubRepo,
          token: config.githubToken,
          title: buildFeedbackIssueTitle(fb, cardName),
          body: buildFeedbackIssueBody(fb, cardName, comment),
        });
      } catch (err) {
        // Release the claim so the approval can be retried.
        await prisma.questionFeedback
          .update({ where: { id: feedbackId }, data: { status: "pending" } })
          .catch(() => {});
        throw err;
      }
      await prisma.questionFeedback.update({
        where: { id: feedbackId },
        data: { status: "approved", issueNumber, adminComment: comment },
      });
      const embeds = buildFinalEmbeds(interaction, 0x2ecc71, comment);
      await interaction.editReply({
        content: `✅ 承認済み（Issue #${issueNumber}）`,
        components: [],
        ...(embeds ? { embeds } : {}),
      });
      return;
    }

    await interaction.reply({ content: "不明な操作です。", ephemeral: true });
  } catch (err) {
    logger.error("Modal submit handler failed:", err);
    const msg = "処理中にエラーが発生しました。";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
}

// --- helpers ------------------------------------------------------------

/**
 * Tell the admin the feedback could not be claimed (already processed, being
 * processed by another admin, or gone), reading the latest status from the DB.
 */
async function reportNotClaimable(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  feedbackId: number,
): Promise<void> {
  const fb = await prisma.questionFeedback.findUnique({ where: { id: feedbackId } });
  const content = fb
    ? `このフィードバックは既に「${fb.status}」のため操作できません。`
    : "対象のフィードバックが見つかりません。";
  await interaction.reply({ content, ephemeral: true });
}

/**
 * Build the comment modal shown when an admin presses approve/reject. The
 * comment is optional; the action ("fb_approve" / "fb_reject") is encoded in
 * the modal customId as "<action>_modal:<feedbackId>".
 */
function buildFeedbackCommentModal(action: string, feedbackId: number): ModalBuilder {
  const approve = action === "fb_approve";
  const comment = new TextInputBuilder()
    .setCustomId("comment")
    .setLabel("コメント（任意）")
    .setPlaceholder(
      approve ? "修正方針や補足（Issueに追記されます）" : "却下理由など",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  return new ModalBuilder()
    .setCustomId(`${action}_modal:${feedbackId}`)
    .setTitle(approve ? "承認コメント" : "却下コメント")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(comment),
    );
}

/** Append the admin comment as an embed field when one was provided. */
function withCommentField(embed: EmbedBuilder, comment: string | null): EmbedBuilder {
  if (comment) {
    embed.addFields({ name: "管理者コメント", value: truncate(comment, 1000) });
  }
  return embed;
}

/**
 * Rebuild the original feedback embed with a new colour and the optional admin
 * comment. Returns undefined when the source message/embed is unavailable
 * (deleted, partial fetch, …) so the caller can skip the embed update and still
 * finalize the message — by this point the DB write (and Issue) already exist,
 * so a missing embed must not throw and lose the status update.
 */
function buildFinalEmbeds(
  interaction: ModalSubmitInteraction,
  color: number,
  comment: string | null,
): EmbedBuilder[] | undefined {
  const src = interaction.message?.embeds?.[0];
  if (!src) return undefined;
  return [withCommentField(EmbedBuilder.from(src).setColor(color), comment)];
}

function buildFeedbackEmbed(
  fb: { content: string },
  cardName: string | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("📝 ユーザーフィードバック (要確認)")
    .setColor(0xf1c40f)
    .addFields(
      { name: "内容", value: truncate(fb.content, 1000) },
      { name: "カード", value: cardName ?? "(カード指定なし)", inline: true },
    );
}

function buildFeedbackButtons(feedbackId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`fb_approve:${feedbackId}`)
      .setLabel("✅ 承認（修正する）")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`fb_reject:${feedbackId}`)
      .setLabel("❌ 却下（修正しない）")
      .setStyle(ButtonStyle.Danger),
  );
}

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
