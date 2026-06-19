# Automation Setup（手動作業）

フィードバック駆動 自動化パイプラインのうち、**コード/ワークフローはこのリポジトリに実装済み**。
本書はリポジトリ外で手動設定が必要な項目をまとめる。

パイプライン全体:
Discord フィードバック → (👤承認) → GitHub Issue → 修正エージェント → PR → 自動CI → (👤マージ) → self-hosted runner 自動デプロイ → Issue close + 通知

人間ゲートは2点（承認・マージ）必須。

---

## 1. Discord Bot の環境変数（`.env`）

`.env.example` を参照。フィードバック機能に必要:

| 変数 | 用途 |
|------|------|
| `GITHUB_TOKEN` | Issue 作成用 PAT（`repo`/`issues:write` スコープ） |
| `ADMIN_CHANNEL_ID` | 承認/却下ボタンを出す管理者チャンネル ID |
| `GITHUB_REPO` | Issue 作成先（既定 `tshnd331/dmquiz1`） |
| `FIX_AGENT` | 任意。Bot 側では未使用（workflow 側で使用） |

設定後、スラッシュコマンドを再登録:

```bash
npm run deploy-commands
```

`/dmquiz_feedback` は **進行中クイズがあるチャンネルでのみ** 動作する（対象カードをセッションから取得するため）。

---

## 2. GitHub Secrets / Variables（Actions）

リポジトリ Settings → Secrets and variables → Actions。

**Secrets:**
| 名前 | 用途 |
|------|------|
| `AUTOMATION_TOKEN` | **Copilot ライセンス保持ユーザーの PAT**（fine-grained: Issues=Read and write, Metadata=Read）。Copilot のアサインには必須で、既定 `GITHUB_TOKEN` では不可。`copilot-agent-loop.yml` の trigger ステップは未設定だと明示エラーで停止する。**auto-deploy が生成する `.env` の `GITHUB_TOKEN`（bot の Issue 作成用）にも流用する** |
| `DISCORD_WEBHOOK_URL` | デプロイ完了通知の Discord Webhook |
| `DISCORD_TOKEN` | bot トークン（`.env` 生成用） |
| `DISCORD_CLIENT_ID` | Discord アプリ（クライアント）ID（`.env` 生成用） |
| `ADMIN_CHANNEL_ID` | 承認/却下ボタンを出す管理者チャンネル ID（`.env` 生成用） |
| `CLAUDE_API_KEY` | 任意。将来の Claude 回答エンジン用（`.env` 生成用） |

**Variables:**
| 名前 | 用途 |
|------|------|
| `FIX_AGENT` | 修正エンジン選択。`copilot`（既定）/ `claude`（未実装スタブ） |
| `DISCORD_GUILD_ID` | 任意。ギルド限定スラッシュコマンド登録用。未設定でグローバル登録（`.env` 生成用） |
| `GITHUB_REPO` | Issue 作成先 `owner/name`。未設定で既定 `tshnd331/dmquiz1`（`.env` 生成用） |

> **コンテナ化 runner と `.env`**: §1 の手動 `.env` 配置はローカル/手動運用向け。
> self-hosted runner（§5）でのデプロイは**毎回 checkout 作業ディレクトリで `docker compose`
> を実行**し、`.env` は gitignore で未追跡かつ checkout の既定 `clean` で消えるため作業
> ディレクトリに存在しない。そのため `auto-deploy.yml` が**デプロイ毎に上記 Secrets/Variables
> から `.env` を再生成**する（`Generate .env from secrets` ステップ）。bot イメージは
> `.env` を含まない（`.dockerignore`）ため、bot のランタイム env はこの生成値が `up` 時に
> 注入されたもの＝**毎デプロイ更新される**。
>
> **必須 / 任意**（実装は `src/config.ts` の `requireBotConfig()`）:
> - **必須**（bot 起動に必要）: `DISCORD_TOKEN` `DISCORD_CLIENT_ID`。未登録なら
>   `Generate .env from secrets` ステップが `::error::` で **fail-fast**（空トークンでの
>   デプロイ＝起動クラッシュループを防ぐ）。
> - **任意**: `ADMIN_CHANNEL_ID` `AUTOMATION_TOKEN`(→`GITHUB_TOKEN`) `CLAUDE_API_KEY`
>   `DISCORD_GUILD_ID` `GITHUB_REPO` `FIX_AGENT`。未登録でも bot は起動するが、
>   フィードバック自動化等の該当機能が無効化される。

---

## 3. Branch Protection（main）

PR 自動マージはしない。Settings → Branches → Add rule（`main`）:

- **Require a pull request before merging** + レビュー承認 **1 件以上**必須
- **Require status checks to pass**: `ci`（`pr-ci-and-review.yml` のジョブ）
- **直接 push を禁止**（管理者含む推奨）

→ 修正エージェントの PR も人間レビュー経由でのみ main に入る。マージは GitHub の Merge ボタンで人間が実行。

---

## 4. Copilot 関連

Copilot には **2つの別機能**があり、それぞれ別途有効化が必要:

### 4-1. Copilot coding agent（修正エンジン）
- リポジトリで Copilot coding agent を有効化すると Issue にアサイン可能になる。`copilot-agent-loop.yml` が approved Issue を検知して `scripts/triggerFixAgent.ts` 経由でアサインする。
- `FIX_AGENT=copilot` の実体は公式の `gh issue edit <num> --add-assignee @copilot`（`@` 必須。additive で既存 assignee を消さない）。
- **トークン必須**: アサインには Copilot ライセンス保持ユーザーの PAT (`AUTOMATION_TOKEN`) が必要。既定 `GITHUB_TOKEN` では不可（参考: zenn.dev/nuits_jp/articles/2025-12-11-assign-copilot-to-issue）。
- Copilot は **Issue 本文**（承認時に生成した Markdown）を読んでタスク理解する。`generateProblemStatementFromIssue()` は claude 等の将来エンジン用補助。
- 将来 Claude 等へ切替: `scripts/triggerFixAgent.ts` の `AGENTS` に実装追加し `FIX_AGENT` variable を変更するだけ。

### 4-2. Copilot code review（レビュアー）
PR への Copilot 自動アサインは **GitHub の ruleset で実現済み**（Settings → Rules → Rulesets →「Copilot のレビューを自動リクエスト」）。専用 workflow は不要のため廃止した。

- **前提**: Copilot code review の有効化（coding agent とは別機能。Copilot Pro+/Business/Enterprise 等が必要）。
- 手動でレビュー依頼する場合は `gh pr edit <PR番号> --repo tshnd331/dmquiz1 --add-reviewer @copilot`（`@` 必須。無しだと collaborator 扱いで 422）。
- REST `requested_reviewers` に `copilot-pull-request-reviewer` というアカウントを渡すのは誤り（無関係な第三者 org, type=Organization）。

`pr-ci-and-review.yml` は CI 結果サマリのコメントのみ担当（レビュー依頼は 4-2 の ruleset で自動化済み・専用 workflow は同梱しない）。

---

## 5. Self-hosted Runner（コンテナ化・IDCF サーバー）

ホスト直インストール（`svc.sh`）ではなく **コンテナで常駐**させる。

1. リポジトリ Settings → Actions → Runners → New self-hosted runner でトークン取得（または PAT を使用）。
2. サーバー上の本リポジトリ配置ディレクトリに `runner.env` を作成:

   ```bash
   REPO_URL=https://github.com/tshnd331/dmquiz1
   ACCESS_TOKEN=ghp_xxx        # repo スコープ PAT（runner 登録用）
   RUNNER_NAME=idcf-runner
   LABELS=self-hosted
   RUNNER_SCOPE=repo
   ```

3. 起動:

   ```bash
   docker compose -f docker-compose.runner.yml up -d
   ```

   - `/var/run/docker.sock` をマウントしているため（Docker-out-of-Docker）、runner 内の `docker compose` が**ホスト docker daemon**を操作する。
   - これにより `auto-deploy.yml` の `docker compose build/up -d bot` が既存 bot コンテナと `dmquiz-data` ボリュームを更新する。
   - **注意**: socket マウントはホスト docker への root 相当権限。専用サーバー前提で許容。

4. runner はサーバーから GitHub へ **outbound (HTTPS long-poll)** で接続 → **inbound FW 変更不要・SSH 不要**。

### COMPOSE_PROJECT_NAME について
`auto-deploy.yml` は `COMPOSE_PROJECT_NAME: dmquiz1` を設定し、手動起動したスタックと同一プロジェクトを更新する。サーバーで bot を手動起動する場合も同じプロジェクト名で起動すること:

```bash
COMPOSE_PROJECT_NAME=dmquiz1 docker compose up -d bot
```

---

## エンドツーエンド検証

1. ローカル: `/dmquiz_start` → `/dmquiz_feedback` → 管理者チャンネルに Embed + ボタン → ✅承認で Issue 作成、❌却下で記録のみ。
2. `copilot-agent-loop` を `workflow_dispatch` で手動実行 → approved Issue に `in-progress` 付与・エージェントアサイン。
3. PR 作成時に `ci` が走り、CI サマリコメントが付く。
4. 人間が承認・マージ → `auto-deploy` が self-hosted runner で発火 → デプロイ・Issue close・Discord 通知。
