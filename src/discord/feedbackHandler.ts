import type { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../db/prisma.js";
import { logger } from "../utils/logger.js";

/** Handle the /dmquiz_feedback command. */
export async function handleFeedback(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const feedbackText = interaction.options.getString("feedback", true);
  const userId = interaction.user.id;

  await prisma.questionFeedback.create({
    data: { feedback: feedbackText, userId },
  });

  await createGitHubIssue(feedbackText, userId);

  await interaction.reply({
    content: "✅ フィードバックありがとうございます！",
    ephemeral: true,
  });
}

async function createGitHubIssue(feedbackText: string, userId: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.warn("GITHUB_TOKEN is not set; skipping GitHub Issue creation.");
    return;
  }

  const body = `## ユーザーフィードバック\n\n${feedbackText}\n\n---\nユーザーID: ${userId}`;
  const title = `[Feedback] ${feedbackText.slice(0, 60)}${feedbackText.length > 60 ? "…" : ""}`;

  try {
    const res = await fetch("https://api.github.com/repos/tshnd331/dmquiz1/issues", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, body, labels: ["feedback"] }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error(`GitHub Issue creation failed (${res.status}): ${text}`);
    }
  } catch (err) {
    logger.error("GitHub Issue creation threw an error:", err);
  }
}
