---
slug: iteratop
title: IteratoP
description: AI回答を自動で磨く
---

# IteratoP - Iteration Processor

**AIの回答を、納得いくまで自動で磨き上げるライブラリ。**

## これは何？

IteratoPは、AIに複雑なタスクを任せるときに、自動で何度もやり直しをさせるツールです。

人間が企画書を何度も推敲するように、AIの回答も「実行 → 評価 → 改善」を繰り返すことで精度が上がります。IteratoPはこのサイクルを自動化し、目標の品質に達したら自動で終了します。

## 解決する課題

**従来の問題点：**
- AIに質問すると、最初の回答が不十分なことがある
- 「もっと詳しく」「別の角度で」と何度もやり取りが必要
- 手動でのフィードバックループは時間がかかる

**IteratoPの解決策：**
- 目標スコアを設定すれば、自動で改善を繰り返す
- 各ステップの評価と次の行動を構造化して定義
- 全過程を記録し、いつでも振り返れる

## 動作の仕組み

IteratoPは5つのステップを繰り返します：

1. **Initialize（初期化）**: タスクの出発点を決める
2. **Act（実行）**: AIが実際に作業をする
3. **Evaluate（評価）**: 結果の品質を数値で測る
4. **Transition（移行）**: 評価をもとに状態を更新
5. **Finalize（完了）**: 目標達成後、最終結果を生成

このサイクルを、あなたが設定した目標スコア（例：70点以上）に達するまで自動で繰り返します。

### 具体例：ファクトチェック

「東京タワーの高さは333メートル」という主張を検証する場合：

1. **1回目**: 初歩的な検索 → 信頼度30点 → 続行
2. **2回目**: 公式サイトを確認 → 信頼度65点 → 続行
3. **3回目**: 複数の信頼できる情報源を比較 → 信頼度90点 → 完了

人間が介入することなく、AIが自動で情報を集め、評価し、必要なら追加調査を行います。

## 使い方（開発者向け）

IteratoPを使うには、5つの関数を定義します。ファクトチェッカーを例に見てみましょう：

```typescript
import { createIterator, createEvaluation, createActionResult } from '@aid-on/iteratop';

const factChecker = createIterator(
  {
    // 1. 初期化：どんな情報から始める？
    initialize: async (claim: string) => ({
      claim,
      queries: [generateInitialQuery(claim)],  // 最初の検索クエリ
      evidence: [],                             // 集めた証拠
      confidence: 0,                            // 現在の信頼度
    }),

    // 2. 実行：何をする？
    act: async (state, context) => {
      // Web検索を実行
      const searchResults = await searchWeb(state.queries.slice(-1)[0]);
      return createActionResult(searchResults, { cost: 0.02 });
    },

    // 3. 評価：どれくらい良い？
    evaluate: async (state, actionResult) => {
      // AIに証拠の信頼性を分析させる
      const analysis = await llmAnalyze(state.claim, actionResult.data);
      return createEvaluation(analysis.confidence, {
        shouldContinue: analysis.confidence < 70,  // 70点未満なら続行
        feedback: analysis.reasoning,
      });
    },

    // 4. 移行：次はどうする？
    transition: async (state, actionResult, evaluation) => ({
      ...state,
      evidence: [...state.evidence, ...actionResult.data],  // 証拠を追加
      confidence: evaluation.score,                          // スコア更新
    }),

    // 5. 完了：最終的に何を返す？
    finalize: async (state, history) => ({
      verdict: state.confidence >= 70 ? 'VERIFIED' : 'UNVERIFIED',
      confidence: state.confidence,
      iterations: history.length,  // 何回繰り返したか
    }),
  },
  {
    maxIterations: 5,      // 最大5回まで
    targetScore: 70,       // 70点で合格
    earlyStopScore: 95,    // 95点なら即終了
    timeout: 30000,        // 30秒でタイムアウト
  }
);

// 実行
const result = await factChecker.run("東京タワーの高さは333メートルである");
```

## リアルタイムで進捗を見る

イベントシステムを使えば、AIが今何をしているかをリアルタイムで確認できます：

```typescript
processor.on((event) => {
  switch (event.type) {
    case 'iteration_start':
      console.log(`イテレーション ${event.iteration + 1} 開始`);
      break;
    case 'evaluation_complete':
      console.log(`スコア: ${event.evaluation.score}`);
      break;
    case 'converged':
      console.log(`目標達成！`);
      break;
  }
});
```

これにより、ユーザーに「今何%完了しているか」を表示したり、処理が止まっていないか監視できます。

## 便利なユーティリティ

IteratoPには、よくある課題を解決するヘルパー関数が付属しています：

```typescript
import { combineEvaluations, withRetry, withTimeout } from '@aid-on/iteratop';

// 複数の評価基準を統合（例：正確性50%、信頼性30%、網羅性20%）
const combined = combineEvaluations(
  [factualAccuracy, sourceCredibility, coverage],
  [0.5, 0.3, 0.2]
);

// APIエラーに備えて自動リトライ
const data = await withRetry(() => fetchFromAPI(url), { maxRetries: 3 });

// タイムアウトを設定（長すぎるAI処理を防ぐ）
const result = await withTimeout(llmGenerate(prompt), 5000);
```

## どこでも動く

- **TypeScript**: 型安全な開発
- **ゼロ依存**: 外部ライブラリ不要で軽量
- **マルチプラットフォーム**: Node.js、Cloudflare Workers、ブラウザ、どこでも動作

## 活用例

- **ファクトチェック**: 複数の情報源から証拠を集め、信頼度を判定
- **コンテンツ生成**: AIが書いた文章を、目標品質まで自動推敲
- **データ分析**: 仮説を立て、検証し、改善を繰り返す
- **問題解決**: 複雑な課題を、段階的に解いていく

---

## インストール

```bash
npm install @aid-on/iteratop
```

詳細なドキュメントとサンプルコードは、GitHubリポジトリをご覧ください。
