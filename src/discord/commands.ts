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
        .setName("question")
        .setDescription("Botの回答が誤っていた質問")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("correct_answer")
        .setDescription("本来の正しい答え")
        .setRequired(true)
        .addChoices(
          { name: "はい", value: "yes" },
          { name: "いいえ", value: "no" },
        ),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("補足・理由（任意）").setRequired(false),
    ),
].map((c) => c.toJSON());
