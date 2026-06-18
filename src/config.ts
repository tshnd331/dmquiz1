import "dotenv/config";

/**
 * Centralised, validated access to environment configuration.
 *
 * Required vars are checked lazily via `requireBotConfig()` so that
 * tooling which does not need a Discord token (e.g. the crawler or
 * seed scripts) can still import this module without crashing.
 */

export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  claudeApiKey: process.env.CLAUDE_API_KEY || undefined,
  discordToken: process.env.DISCORD_TOKEN || undefined,
  discordClientId: process.env.DISCORD_CLIENT_ID || undefined,
  discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
  // Feedback automation pipeline (all optional; validated when used).
  githubToken: process.env.GITHUB_TOKEN || undefined,
  adminChannelId: process.env.ADMIN_CHANNEL_ID || undefined,
  githubRepo: process.env.GITHUB_REPO || "tshnd331/dmquiz1",
  fixAgent: process.env.FIX_AGENT || "copilot",
};

/** True once a Claude key is configured (the future answerer can be enabled). */
export const hasClaudeApiKey = Boolean(config.claudeApiKey);

/**
 * Validate and return the config required to run / register the bot.
 * Throws a clear error listing every missing variable.
 */
export function requireBotConfig(): BotConfig {
  const missing: string[] = [];
  if (!config.discordToken) missing.push("DISCORD_TOKEN");
  if (!config.discordClientId) missing.push("DISCORD_CLIENT_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `Copy .env.example to .env and fill them in.`,
    );
  }

  return {
    discordToken: config.discordToken!,
    discordClientId: config.discordClientId!,
    discordGuildId: config.discordGuildId,
  };
}
