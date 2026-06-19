# Copilot coding agent への指示

このリポジトリは **デュエマ当てクイズ Discord Bot**。ユーザーがカードを当てるクイズに対し、ルールベース回答器が回答する。誤回答のユーザーフィードバックは管理者承認を経て GitHub Issue（`feedback` + `approved` ラベル）になり、Copilot にアサインされる。あなたの仕事はその Issue を解決する PR を作ること。

## PR ルール（最重要）

- **アサインされた Issue を解決する PR では、PR 本文（description）に必ず `Closes #<その Issue 番号>` を記載する。** main へのマージ時に元 Issue が自動 close されるようにするため。
- **自動マージはしない。** 人間レビュー必須（branch protection）。

## 修正の進め方

1. Issue 本文の質問 / カード / Bot の回答 / 正解 を確認する。
2. `src/quiz/RuleBasedQuestionAnswerer.ts` の該当カテゴリ（文明 / コスト / パワー / 種族 / カードタイプ）のルールを修正し、正しい回答を返すようにする。
3. `test/` にこの誤りを再現する回帰テストを追加する（`node:test` + `tsx`、`test/**/*.test.ts`）。

## ビルド / テスト

変更後は必ず以下が通ること:

```bash
npm test          # tsx --test "test/**/*.test.ts"
npm run build     # tsc -p tsconfig.json
```

Node.js 20 以上。ESM（`"type": "module"`）。TypeScript の import は拡張子 `.js` で書く（例: `from "../src/github/issues.js"`）。
