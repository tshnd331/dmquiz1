# Feedback-Driven Automation System

## Overview
Build an end-to-end automation pipeline:
Discord フィードバック → GitHub Issue → Copilot Agent → 自動修正 → PR作成 → 自動レビュー → マージ → 自動デプロイ

## System Architecture

```
Discord Feedback
    ↓
GitHub Issue (label: feedback)
    ↓
GitHub Actions Polling (5min intervals)
    ↓
Copilot Agent (Auto fix + PR create)
    ↓
Auto Test & Review
    ↓
Auto Merge
    ↓
Auto Deploy
    ↓
Issue Close
```

## Implementation Phases

### Phase 1: Discord → GitHub Issue Automation
- [ ] DB: `QuestionFeedback` テーブル追加
- [ ] DB: `FeedbackStats` テーブル追加
- [ ] Discord: `/dmquiz_feedback` コマンド実装
- [ ] Discord: Issue 自動作成機能
- [ ] 環境変数: `GITHUB_TOKEN` 設定

### Phase 2: GitHub Actions Polling & Agent Trigger
- [ ] Workflow: `.github/workflows/copilot-agent-loop.yml` 作成
- [ ] Workflow: Issue ポーリング (5分ごと)
- [ ] Workflow: 新規 Issue 検知 & `in-progress` ラベル追加
- [ ] Event dispatch: Copilot Agent タスク起動

### Phase 3: Copilot Agent - Auto Fix & PR Create
- [ ] Function: `generateProblemStatementFromIssue()`
- [ ] Copilot Agent integration: 自動修正タスク
- [ ] Copilot: RuleBasedQuestionAnswerer 修正
- [ ] Copilot: テストケース追加
- [ ] Copilot: PR 作成

### Phase 4: Auto Review & Test
- [ ] Workflow: `.github/workflows/auto-review-and-merge.yml` 作成
- [ ] Test: `npm run test` 自動実行
- [ ] Lint: `npm run lint` 自動実行
- [ ] Build: `npm run build` 自動実行
- [ ] Copilot: 自動コード レビュー
- [ ] Action: PR コメント with レビュー結果
- [ ] Action: 自動 APPROVE & マージ

### Phase 5: Auto Deploy
- [ ] Workflow: `.github/workflows/auto-deploy.yml` 作成
- [ ] Build & Test: PR merge 時に実行
- [ ] Deploy: 本番環境へ (Railway/Heroku など)
- [ ] Issue Close: 関連 Issue を自動クローズ
- [ ] Notification: デプロイ完了通知

## Implementation Details

### Database Schema Extension
```prisma
model QuestionFeedback {
  id        Int      @id @default(autoincrement())
  cardId    Int
  card      Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  
  question  String
  botAnswer String   // "yes" | "no" | "unknown"
  userCorrectAnswer String?
  reason    String?
  userId    String
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([cardId])
  @@index([userId])
  @@index([createdAt])
}

model FeedbackStats {
  id           Int      @id @default(autoincrement())
  questionPattern String
  ruleCategory String   // "civilization" | "cost" | "power" | "race" | "cardType"
  
  totalFeedback Int    @default(0)
  incorrectCount Int   @default(0)
  accuracy      Float  // 0.0 ~ 1.0
  
  lastUpdated   DateTime @updatedAt
  
  @@unique([questionPattern, ruleCategory])
}
```

### Discord Command
```
/dmquiz_feedback question:<質問> correct_answer:<はい|いいえ> [reason:<理由>]
```

User Message:
```
✅ フィードバックありがとうございます！
```

Background: GitHub Issue 自動作成

### GitHub Issue Format
```markdown
## 📝 ユーザーフィードバック

**質問内容:**
`{question}`

**カード名:** {card.name}

**Botの回答:** {botAnswer}

**正解:** {userCorrectAnswer}

**理由:**
{reason}

**ユーザー ID:** {userId}

---

このIssueは、Copilot エージェントにより自動ハンドル予定です。
```

Labels: `feedback`, `auto-generated`, `rule-improvement`

### Environment Variables
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
DEPLOY_TOKEN=xxxx
```

## Testing Strategy

- Unit tests: RuleBasedQuestionAnswerer の既存 & 新規テスト
- Integration tests: Discord ↔ GitHub integration
- E2E: フルパイプラインテスト

## Success Criteria

1. Discord フィードバック → GitHub Issue 自動作成 ✅
2. GitHub Issue → Copilot Agent 自動検知 ✅
3. Copilot Agent → 自動修正 & PR 作成 ✅
4. 自動テスト & レビュー通過 ✅
5. PR 自動マージ ✅
6. 本番環境へ自動デプロイ ✅
7. Issue 自動クローズ ✅

## Notes

- **Copilot Review**: 同一 Copilot による実装 + レビュー。品質は十分 (テスト強い)
- **Revertability**: Git なので問題あれば即座に復旧可能
- **Monitoring**: Issue ポーリングは 5分間隔 (調整可能)
