# DNA希釈計算ツール（MiSeq用）v2.2 — Web版

`dna_dilution_calculator.py`（Python / tkinter 版 v2.2）を **ブラウザで動く静的 Web アプリ**として移植したものです。
Qubit 測定濃度から、MiSeq シークエンシングに必要なモル濃度（nM）／質量濃度（ng/µL）に希釈するための **RNase free 水の量** を計算します。

- ビルド不要の静的サイト（HTML + CSS + バニラ JavaScript、外部依存ゼロ）
- 計算はすべてブラウザ内で完結し、入力データはサーバーに送信されません
- GitHub リポジトリを Vercel にインポートするだけで公開できます

## プライマーセット プリセット（固定・編集不可）

nM モードの「プリセット」から選択すると、平均増幅塩基長が自動入力されます。

| Primer set名称 | 増幅遺伝子領域 | 平均増幅塩基長 |
|---|---|---|
| 341-805 | 16S V3〜V4 | 600 bp |
| F04/R22mod | 18S V1 | 501 bp |
| TAReuk | 18S V4 | 517 bp |
| 14F1/s15.3 | 18S V6 | 262 bp |
| 14F3/s17 | 18S V6 | 464 bp |
| SYM_VAL | 褐虫藻ITS2 | 452 bp |
| MiFish | mt12S | 328 bp |

プリセットは `src/calc.js` の `PRESETS` 配列に定義された読み取り専用の定数です。
項目を増減する場合は `PRESETS` と `index.html` の参照テーブル（表示専用）の 2 箇所を編集してください。

## 移植の方針

デスクトップ版と **同じ数値・同じ表示文字列** を返すことを最優先にしています。

| Python 版 | Web 版での実装 |
|---|---|
| `round(x, n)`（偶数丸め） | `pyRound()` として偶数丸めを自前実装（`Math.round` は使わない） |
| `str(float)`（`312.0` は `"312.0"`） | `pyStr()` で Python の文字列表現を再現 |
| `_fmt_val()` / `_strip_tag()` | 同名ロジックをそのまま移植（`bp` は int 表示、`strip_group` は 1 始まり） |
| `_parse_nm()` / `_parse_ng()` | 行数不一致・塩基長不足・ヘッダ行スキップの判定条件まで同一 |
| `load_col_defaults()` / `save_col_defaults()` | `localStorage["dna_dilution_col_defaults"]` |
| `filedialog.asksaveasfilename()` | ブラウザのダウンロード（ファイル名は `dilution_{mode}_{YYYYMMDD_HHMM}` で同一） |
| `messagebox` | `<dialog>` によるモーダル（文言はそのまま） |
| `webbrowser.open()`（HTML保存後） | 別タブでレポートをプレビュー |
| `GenePresetDialog` / `load_presets()` / `save_presets()` | **非実装**（プリセットは固定リスト化。下記「差異」参照） |

`DNADilutionApp` / `ColumnSelectDialog` の各メソッドは、対応関係がわかるよう
`src/app.js` 内にコメント（例: `// _refresh_tree_nm`）で明示しています。

## 機能

- **モル濃度希釈 (nM)**: ターゲット nM・サンプル量・MW per bp・共通/個別塩基長、プライマーセット プリセット
- **濃度希釈 (ng/µL)**: ターゲット ng/µL・サンプル量
- **入力**: 個別入力（列ごとに貼り付け）／一括入力（タブ・カンマ区切り、ヘッダ行は自動スキップ）
- **8連チューブ色分け**: 8 行ごとに交互着色、濃度不足行は赤を優先
- **出力**: CSV（UTF-8 BOM 付き）／HTML レポート（印刷時の背景色保持対応）／タブ区切りクリップボードコピー
- **出力列選択**: 全選択・全解除・デフォルトに設定・デフォルトに戻す

## 計算式

**モル濃度希釈 (nM)**

```
ターゲット (pg/µL) = MW_per_bp × 塩基長 × ターゲット(nM) ÷ 1000
希釈水量 X (µL)    = サンプル量 × ( Qubit(ng/µL)×1000 ÷ ターゲット(pg/µL) − 1 )
半量               = 希釈水量 ÷ 2
```

**濃度希釈 (ng/µL)**

```
希釈水量 X (µL) = サンプル量 × ( Qubit濃度(ng/µL) ÷ ターゲット(ng/µL) − 1 )
半量            = 希釈水量 ÷ 2
```

`Qubit ≤ ターゲット` の場合は `濃度不足` / `―` を表示します。

## ディレクトリ構成

```
.
├── index.html              # UI（モード2タブ + 入力2タブ + 結果表 + プリセット一覧 + ステータスバー）
├── assets/
│   ├── styles.css
│   └── favicon.svg
├── src/
│   ├── calc.js             # 計算コア + 固定プリセット定義（PRESETS）
│   └── app.js              # UI・列選択・CSV/HTML/クリップボード出力
├── tests/
│   └── calc.test.mjs       # Python 版との一致検証 + プリセット検証
├── .github/workflows/test.yml
├── vercel.json             # 静的デプロイ設定（ビルドなし）
├── package.json
├── .gitignore
└── LICENSE
```

## ローカルでの確認

ES Modules を使うため、`file://` で直接開かずローカルサーバー経由で開いてください。

```bash
npm run dev            # npx serve .  → http://localhost:3000
# または
python -m http.server 8000
```

テスト（Node.js 18 以上）:

```bash
npm test
```

## GitHub → Vercel へのデプロイ

```bash
cd dna-dilution-calculator-web
git init
git add .
git commit -m "feat: DNA希釈計算ツール v2.2 Web版（プライマーセット プリセット固定搭載）"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/dna-dilution-calculator-web.git
git push -u origin main
```

1. [vercel.com](https://vercel.com) にログイン → **Add New… → Project**
2. 対象リポジトリを **Import**
3. Framework Preset は **Other**（`vercel.json` によりビルドは実行されません）
4. Root Directory はリポジトリ直下のまま → **Deploy**

以降は `main` への push で自動的に本番へ反映され、プルリクエストごとにプレビュー URL が発行されます。

## 検証済みテスト（`npm test` / 全 12 件）

| モード | 入力 | 希釈水量 / 半量 |
|---|---|---|
| nM | 447 bp, 23.1 ng/µL（4 nM, 10 µL, MW 660） | 185.7 / 92.9 |
| nM | 600 bp, 51.0 ng/µL | 312.0 / 156.0 |
| nM | 600 bp, 52.8 ng/µL | 323.3 / 161.7 |
| nM | 600 bp, 42.2 / 47.2 / 43.6 ng/µL | 256.4 / 288.0 / 265.3 |
| nM | 452 bp（SYM_VAL）, 23.1 ng/µL | 183.6 / 91.8 |
| ng/µL | 10.0 → 2.0 ng/µL | 40.0 / 20.0 |
| ng/µL | 5.0 → 2.0 ng/µL | 15.0 / 7.5 |
| ng/µL | 1.5 → 2.0 ng/µL | 濃度不足 / ― |

あわせて、偶数丸め（`round(2.5)==2`, `round(3.5)==4`）、`str(float)` の表示（`1584.0`）、
`_strip_tag` / `_fmt_val` の挙動、一括入力のヘッダスキップ、エラーメッセージ文言、
固定プリセット 7 件の内容を検証しています。

## デスクトップ版との差異

| 項目 | Python/tkinter 版 | Web 版 |
|---|---|---|
| プリセット | ユーザーが追加・編集・削除（JSON に保存） | **固定リスト（読み取り専用）**。管理ダイアログは非搭載 |
| 列デフォルトの保存先 | 実行ファイルと同じフォルダの JSON | ブラウザの localStorage |
| ファイル出力 | 保存ダイアログで任意の場所へ | ブラウザのダウンロードフォルダ |
| アイコン | `dna_dilution_icon.ico` | `assets/favicon.svg` |
| 実行環境 | Windows（EXE / Python 3.9+） | 任意のモダンブラウザ |
| 追加機能 | — | 「テストデータ入力」ボタン、プリセット一覧の参照表示 |

## ライセンス

MIT License
