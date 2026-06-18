# Automation Setup（手動作業）

`AUTOMATION_PLAN.md` のパイプラインのうち、**コード/ワークフローはこのリポジトリに実装済み**。
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
| `AUTOMATION_TOKEN` | Copilot coding agent のアサイン等に使う PAT。未設定時は `GITHUB_TOKEN`（既定トークン）にフォールバック（ラベル付けは可能だが Copilot アサインには PAT 推奨） |
| `DISCORD_WEBHOOK_URL` | デプロイ完了通知の Discord Webhook |

**Variables:**
| 名前 | 用途 |
|------|------|
| `FIX_AGENT` | 修正エンジン選択。`copilot`（既定）/ `claude`（未実装スタブ） |

---

## 3. Branch Protection（main）

PR 自動マージはしない。Settings → Branches → Add rule（`main`）:

- **Require a pull request before merging** + レビュー承認 **1 件以上**必須
- **Require status checks to pass**: `ci`（`pr-ci-and-review.yml` のジョブ）
- **直接 push を禁止**（管理者含む推奨）

→ 修正エージェントの PR も人間レビュー経由でのみ main に入る。マージは GitHub の Merge ボタンで人間が実行。

---

## 4. Copilot 関連

- **Copilot coding agent**: リポジトリで有効化すると Issue にアサイン可能になる。`copilot-agent-loop.yml` が approved Issue を検知して `scripts/triggerFixAgent.ts` 経由でアサインする。
  - `FIX_AGENT=copilot` の実体は GraphQL `suggestedActors`（`CAN_BE_ASSIGNED`）→ `replaceActorsForAssignable`。仕様変更時は `scripts/triggerFixAgent.ts` の `copilotAgent` を調整。
- **Copilot code review**: Settings / ruleset で有効化（workflow からは発火不可）。`pr-ci-and-review.yml` は CI 結果サマリのコメントのみ担当。

将来 Claude 等へ切替: `scripts/triggerFixAgent.ts` の `AGENTS` に実装を追加し、`FIX_AGENT` variable を変更するだけ。

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
