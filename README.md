# dmquiz — Duel Masters Quiz Discord Bot

DB からランダムに選ばれた1枚のデュエル・マスターズのカードを、「はい / いいえ」で答えられる質問を重ねて当てる Discord Bot です。

- **言語/実行**: TypeScript + Node.js（discord.js v14）
- **DB**: SQLite（Prisma ORM）
- **クロール**: dmwiki.net を cheerio で解析
- **AI 判定**: `QuestionAnswerer` インターフェースで抽象化。現状はルールベース、将来 Claude API に差し替え可能

---

## クイズルール

- クイズ状態は **Discord チャンネル単位** で管理されます。
- 質問は **最大 10 回**。1 回質問するたびに **回答権 +1**（回答権は最大 10）。
- 質問が 10 回に達すると追加質問は不可。
- カード名の回答（guess）は **回答権を 1 消費**。回答権が 0 だと回答できません。
  - 正解 → 勝利・終了
  - 不正解 → 不正解回数 +1。**不正解 10 回で敗北**。
- カード名はゆるく照合（全角/半角・空白・記号・大文字小文字を無視）。

### コマンド

| コマンド | 説明 |
| --- | --- |
| `/dmquiz_start` | そのチャンネルでクイズを開始 |
| `/dmquiz_ask question:<質問>` | 質問する。Bot が「はい / いいえ / 判断不能」で回答（質問+1, 回答権+1） |
| `/dmquiz_guess card_name:<カード名>` | カード名を回答（回答権を1消費） |
| `/dmquiz_status` | 質問回数・回答権・不正解回数を表示 |
| `/dmquiz_giveup` | 答えを表示して終了 |

質問例（ルールベースで判定可能なもの）:
`火文明ですか` / `コストは5以上ですか` / `パワーは6000以上ですか` / `クリーチャーですか` / `ドラゴンですか`

判定できない質問には「判断不能」を返します。

---

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. 環境変数

```bash
cp .env.example .env
```

`.env` を編集:

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | Bot トークン |
| `DISCORD_CLIENT_ID` | ✅ | アプリケーション（クライアント）ID |
| `DISCORD_GUILD_ID` | 任意 | 設定するとコマンドを即時反映（開発向け）。未設定だとグローバル登録 |
| `DATABASE_URL` | ✅ | 既定 `file:./dev.db` |
| `CLAUDE_API_KEY` | 任意 | 将来の Claude 連携用。現状未使用 |

### 3. DB 初期化

```bash
npm run prisma:generate   # Prisma Client 生成
npm run prisma:migrate    # SQLite に Card / CrawlTarget テーブルを作成
```

### 4. カードデータ投入

クロール前にすぐ試したい場合はサンプルを投入:

```bash
npm run seed
```

dmwiki からクロールする場合:

```bash
npm run crawl                   # 既定: 数エキスパンション・カード最大50枚
npm run crawl -- --limit 5      # エキスパンションを最大5件処理
npm run crawl -- --max-cards 20 # この実行で取得するカードを最大20枚に制限
npm run crawl -- --all          # 全エキスパンション・全カード（時間がかかります）
npm run crawl -- --force        # 取得済みでも再取得
```

> 1 エキスパンションでも収録カードは数百枚あります。既定では `--max-cards 50` で打ち切り、
> 残りは `CrawlTarget` に `pending` として残るため、再度 `npm run crawl` を実行すると続きから取得します（途中再開）。

### 5. スラッシュコマンド登録

```bash
npm run deploy-commands
```

### 6. Bot 起動

```bash
npm run dev     # 開発（tsx watch）
# または
npm run build && npm start
```

---

## Docker

Docker / Docker Compose で起動する場合。ローカルに Node を入れずに動かせます。

### 1. 環境変数

```bash
cp .env.example .env
```

`DISCORD_TOKEN` / `DISCORD_CLIENT_ID`（任意で `DISCORD_GUILD_ID`）を記入。
`DATABASE_URL` は Compose 側で `file:/app/data/dev.db`（永続ボリューム上）に上書きされるため、設定不要です。

### 2. イメージビルド

```bash
docker compose build
```

### 3. スラッシュコマンド登録（初回必須）

```bash
docker compose run --rm bot npm run deploy-commands
```

### 4. カードデータ投入（必要時）

```bash
docker compose run --rm bot npm run seed     # サンプル投入
docker compose run --rm bot npm run crawl    # dmwiki からクロール
```

### 5. Bot 起動

```bash
docker compose up -d
```

起動時に `prisma migrate deploy` が自動実行され、DB（`Card` / `CrawlTarget`）を初期化／追従します。

```bash
docker compose logs -f bot   # ログ確認
docker compose down          # 停止（DB は named volume dmquiz-data に保持）
```

> SQLite DB は named volume `dmquiz-data`（コンテナ内 `/app/data/dev.db`）に永続化されます。
> `docker compose down -v` を実行するとボリュームごと DB が削除される点に注意してください。

---

## クローラの設計

`src/crawler/dmwikiCrawler.ts`

- 1 リクエストごとに **1〜3 秒のランダム sleep**
- **User-Agent を明記**
- `CrawlTarget` テーブルで進捗を記録 → **途中再開可能**・**同一 URL の重複取得を回避**
- 失敗は **最大 3 回までリトライ**（試行回数を記録し、超えたら failed）
- 取得済みカード（`Card.sourceUrl` 一致）は再取得しない（`--force` で再取得）
- パースは **rawText の保存を最優先**。文明 / コスト / カードタイプ / 種族 / パワー / 能力テキストは best-effort 抽出

---

## AI 判定の差し替え

`src/quiz/QuestionAnswerer.ts` がインターフェース:

```ts
interface QuestionAnswerer {
  answer(card: Card, question: string): Promise<{
    answer: 'yes' | 'no' | 'unknown';
    reason: string;
  }>;
}
```

現在は `RuleBasedQuestionAnswerer`（`src/quiz/RuleBasedQuestionAnswerer.ts`）を使用。
将来 `ClaudeQuestionAnswerer` を同インターフェースで実装し、`src/index.ts` の生成箇所を差し替えるだけで切り替えられます（`CLAUDE_API_KEY` を利用）。

---

## プロジェクト構成

```
src/
  index.ts              Bot 起動・interaction 配線
  config.ts             env 読込・検証
  discord/
    commands.ts         スラッシュコマンド定義
    handlers.ts         コマンド処理
  quiz/
    QuizSession.ts      1 セッションの状態・遷移
    QuizManager.ts      channelId 単位のセッション管理 + ランダム抽選
    QuestionAnswerer.ts 判定インターフェース
    RuleBasedQuestionAnswerer.ts
  crawler/
    dmwikiCrawler.ts    クロール制御（再開/リトライ/sleep/force/limit）
    parser.ts           cheerio パース
  db/prisma.ts          PrismaClient シングルトン
  utils/                sleep, logger
prisma/schema.prisma    Card / CrawlTarget
scripts/
  crawlDmwiki.ts        npm run crawl
  deployCommands.ts     npm run deploy-commands
  seed.ts               npm run seed
```

---

## npm scripts

| script | 説明 |
| --- | --- |
| `npm run dev` | tsx watch で起動 |
| `npm run build` | TypeScript ビルド（→ `dist/`） |
| `npm start` | ビルド済みを実行 |
| `npm run prisma:generate` | Prisma Client 生成 |
| `npm run prisma:migrate` | マイグレーション |
| `npm run crawl` | dmwiki クロール |
| `npm run deploy-commands` | スラッシュコマンド登録 |
| `npm run seed` | サンプルカード投入 |

---

## 免責

クロールは dmwiki.net への負荷に配慮してください（sleep・取得範囲の限定）。User-Agent の連絡先は自分のものに書き換えることを推奨します。
