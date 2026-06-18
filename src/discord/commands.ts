import { SlashCommandBuilder } from "discord.js";

/**
 * Slash command definitions. Shared between the runtime (to match incoming
 * interactions) and the deploy script (to register them with Discord).
 */
export const commands = [
  new SlashCommandBuilder()
    .setName("dmquiz_start")
    .setDescription("このチャンネルでデュエマ当てクイズを開始します"),

  new SlashCommandBuilder()
    .setName("dmquiz_ask")
    .setDescription("はい/いいえで答えられる質問をします（質問+1, 回答権+1）")
    .addStringOption((opt) =>
      opt
        .setName("question")
        .setDescription("例: 火文明ですか / コストは5以上ですか / ドラゴンですか")
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("dmquiz_guess")
    .setDescription("カード名を回答します（回答権を1消費）")
    .addStringOption((opt) =>
      opt.setName("card_name").setDescription("当てたいカード名").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("dmquiz_status")
    .setDescription("現在の質問回数・回答権・不正解回数を表示します"),

  new SlashCommandBuilder()
    .setName("dmquiz_giveup")
    .setDescription("ギブアップして答えを表示します"),

  new SlashCommandBuilder()
    .setName("dmquiz_feedback")
    .setDescription("進行中クイズのBot回答が誤っていた場合に報告します（管理者確認後に対応）")
    .addStringOption((opt) =>
      opt
        .setName("content")
        .setDescription("どの質問でBotの回答が誤っていたか・本来の正解・理由を自由に記入")
        .setRequired(true),
    ),
].map((c) => c.toJSON());
