import { Client, Events, GatewayIntentBits } from "discord.js";
import { requireBotConfig, hasClaudeApiKey } from "./config.js";
import { QuizManager } from "./quiz/QuizManager.js";
import { RuleBasedQuestionAnswerer } from "./quiz/RuleBasedQuestionAnswerer.js";
import type { QuestionAnswerer } from "./quiz/QuestionAnswerer.js";
import { handleInteraction, handleButtonInteraction } from "./discord/handlers.js";
import { disconnectPrisma } from "./db/prisma.js";
import { logger } from "./utils/logger.js";

async function main() {
  // Validate required config up-front (throws with a clear message).
  const cfg = requireBotConfig();

  // Pick the answerer strategy. Currently rule-based; ClaudeQuestionAnswerer
  // can be swapped in here once implemented.
  const answerer: QuestionAnswerer = new RuleBasedQuestionAnswerer();
  if (hasClaudeApiKey) {
    logger.info(
      "CLAUDE_API_KEY detected, but ClaudeQuestionAnswerer is not implemented yet; using RuleBasedQuestionAnswerer.",
    );
  }
  const manager = new QuizManager(answerer);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    logger.info(`Logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleInteraction(interaction, manager);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    }
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await client.destroy();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info("Logging in to Discord...");
  await client.login(cfg.discordToken);
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
