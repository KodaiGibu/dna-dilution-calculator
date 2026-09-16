# DNA希釈計算ツール（MiSeq用）Web版

Qubit 測定濃度から、MiSeq シークエンシングに必要なモル濃度（nM）／質量濃度（ng/µL）へ希釈するための **RNase free 水の量** を自動計算する Web ツールです。
デスクトップ版（Python/tkinter v2.2）の仕様書に準拠して再実装しました。

- **ビルド不要の静的サイト**（HTML + CSS + バニラ JavaScript、依存パッケージゼロ）
- **完全クライアントサイド処理** — 入力データはサーバーに送信されません
- Vercel に GitHub リポジトリをインポートするだけでデプロイ可能

## 機能

| 機能 | 内容 |
|---|---|
| モル濃度希釈 (nM) | ターゲット nM・サンプル量・MW/bp・塩基長から希釈水量と半量を計算 |
| 濃度希釈 (ng/µL) | ターゲット ng/µL・サンプル量から希釈水量と半量を計算 |
| 入力方式 | 個別入力（列ごとの貼り付け）／一括入力（タブ・カンマ区切り、ヘッダ行自動スキップ） |
| 塩基長プリセット | 遺伝子名 + bp の追加・編集・削除（localStorage に保存） |
| 8連チューブ色分け | 8 行ごとに交互着色、濃度不足行は赤で優先表示 |
| 出力 | CSV（UTF-8 BOM 付き）／印刷対応 HTML レポート／タブ区切りクリップボードコピー |
| 出力列選択 | 列のチェック選択とモード別デフォルト保存（localStorage） |

## 計算式

**モル濃度希釈 (nM)**

```
ターゲット(pg/µL) = MW/bp × 塩基長(bp) × ターゲット(nM) ÷ 1000
希釈水量 X (µL)   = サンプル量 × ( Qubit(ng/µL) × 1000 ÷ ターゲット(pg/µL) − 1 )
半量              = 希釈水量(丸め前の生値) ÷ 2
```

**濃度希釈 (ng/µL)**

```
希釈水量 X (µL) = サンプル量 × ( Qubit(ng/µL) ÷ ターゲット(ng/µL) − 1 )
半量            = 希釈水量(丸め前の生値) ÷ 2
```

濃度不足（Qubit ≤ ターゲット）の場合は `濃度不足` / `―` を表示します。
丸めはデスクトップ版（Python `round()`）と結果を一致させるため **銀行丸め（round-half-to-even）** を実装しています（`roundHalfEven()`）。

## ディレクトリ構成

```
.
├── index.html              # UI（単一ページ）
├── assets/
│   ├── styles.css
│   └── favicon.svg
├── src/
│   ├── calc.js             # 計算コア（純粋関数・依存なし・テスト対象）
│   └── app.js              # UI・プリセット・列選択・エクスポート
├── tests/
│   └── calc.test.mjs       # 仕様書 §12 テストケース
├── .github/workflows/test.yml
├── vercel.json             # 静的デプロイ設定（ビルドなし）
├── package.json
├── .gitignore
└── LICENSE
```

## ローカルでの動作確認

ES Modules を使用しているため、`index.html` をファイル直接オープン（`file://`）ではなくローカルサーバー経由で開いてください。

```bash
npm run dev          # npx serve . （http://localhost:3000）
# または
python -m http.server 8000
```

テストの実行（Node.js 18 以上）:

```bash
npm test
```

## GitHub → Vercel へのデプロイ手順

```bash
cd dna-dilution-calculator-web
git init
git add .
git commit -m "feat: DNA希釈計算ツール Web版 v2.2"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/dna-dilution-calculator-web.git
git push -u origin main
```

1. [vercel.com](https://vercel.com) にログイン → **Add New… → Project**
2. 対象の GitHub リポジトリを **Import**
3. Framework Preset は **Other**（`vercel.json` によりビルドは実行されません）
4. Root Directory はリポジトリ直下のまま → **Deploy**
5. 数十秒で `https://<プロジェクト名>.vercel.app` に公開されます

以降は `main` への push が自動で本番反映され、プルリクエストごとにプレビュー URL が発行されます。

## 検証済みテストケース

| モード | 入力 | 期待値（希釈水量 / 半量） |
|---|---|---|
| nM | 447 bp, 23.1 ng/µL, 4 nM, 10 µL | 185.7 / 92.9 |
| nM | 600 bp, 51.0 ng/µL | 312.0 / 156.0 |
| nM | 600 bp, 52.8 ng/µL | 323.3 / 161.7 |
| ng/µL | 10.0 ng/µL → 2.0 ng/µL | 40.0 / 20.0 |
| ng/µL | 1.5 ng/µL → 2.0 ng/µL | 濃度不足 / ― |

## デスクトップ版との差異

| 項目 | デスクトップ版 | Web 版 |
|---|---|---|
| 設定の保存先 | JSON ファイル（EXE と同フォルダ） | ブラウザの localStorage |
| ファイル出力 | 保存ダイアログ | ブラウザのダウンロード |
| アイコン | .ico | SVG favicon |
| 実行環境 | Windows（EXE / Python 3.9+） | 任意のモダンブラウザ |

## ライセンス

MIT License
