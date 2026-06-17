import { REST, Routes } from "discord.js";
import { commands } from "../src/discord/commands.js";
import { requireBotConfig } from "../src/config.js";
import { logger } from "../src/utils/logger.js";

/**
 * Registers slash commands with Discord.
 *
 * - If DISCORD_GUILD_ID is set, commands are registered to that guild
 *   (appear almost instantly — ideal for development).
 * - Otherwise they are registered globally (can take up to ~1 hour).
 */
async function main() {
  const cfg = requireBotConfig();
  const rest = new REST({ version: "10" }).setToken(cfg.discordToken);

  if (cfg.discordGuildId) {
    logger.info(
      `Registering ${commands.length} guild command(s) to ${cfg.discordGuildId}...`,
    );
    await rest.put(
      Routes.applicationGuildCommands(cfg.discordClientId, cfg.discordGuildId),
      { body: commands },
    );
    logger.info("Guild commands registered.");
  } else {
    logger.info(`Registering ${commands.length} global command(s)...`);
    await rest.put(Routes.applicationCommands(cfg.discordClientId), {
      body: commands,
    });
    logger.info("Global commands registered (may take up to ~1h to appear).");
  }
}

main().catch((err) => {
  logger.error("Failed to deploy commands:", err);
  process.exit(1);
});
