# FUTSAL NOTE

スマートフォンを中心に使えるフットサル出席管理アプリです。Next.js App Router / React / TypeScript で実装しています。

## 起動

```bash
npm install
npm run dev
```

http://localhost:3000 を開いてください。

## 機能

- 月ごとのカレンダーで開催日を選択・追加・削除（日付のみ、同じ日は1件まで）
- 画面下部の「メンバー登録・編集」から固定メンバーの追加・名前の編集・削除・表示順の変更（左の「⋮⋮」をドラッグ＆ドロップ。スマートフォンでは指で操作、キーボードでは上下の矢印キーで移動）
- 開催日ごとの ○ / × 表示（出席・欠席、未回答は空欄）、出欠による絞り込み
- メンバー名による検索（出欠の絞り込みと併用可能）
- 編集モーダルで出欠・複数人の名前・「本人も参加人数に含める」の切り替え・備考を編集
- 連れを含めた出席人数、回答の最終更新日時
- 開催日削除は画面下部の設定から行い、確認用の日付入力が必要。キャンセル時の編集破棄

一覧では出欠を変更できません。「編集」から変更し、「変更を保存」で確定します。

合計参加人数は、出席かつ「本人も参加人数に含める」が有効な本人の人数と、追加した名前の人数の合計です。本人が欠席・未回答の場合でも、名前の追加・編集・削除ができ、追加した人は合計人数に含まれます。

ブラウザを開くと、今日の開催日、今日より後で最も近い開催日、過去で最も新しい開催日の順に自動選択します。手動で別の日を選んだ後はその選択を維持します。画面上部には登録済みの日付を最大6件表示します。基本は直近の過去2件と今日以降の日付を表示し、片側が不足する場合はもう片側の日付で6件まで補います。

## データ

Supabase（PostgreSQL）にメンバー・開催日・出欠・追加した名前・備考を保存します。初期データは空です。以前の `localStorage` データは読み込まず、Supabaseに自動移行もしません。

各操作は対象のレコードだけを更新します。メンバーや開催日を削除すると、関連する回答もデータベースで削除されます。ほかの人の変更は10秒ごと、および画面に戻ったときに取得します。同じ人の同じ開催日の回答を同時に編集した場合は、後から保存した内容が優先されます。

### Supabaseの初期設定

1. [Supabase](https://supabase.com/dashboard)でプロジェクトを作成します。
2. SQL Editorで [`supabase/schema.sql`](supabase/schema.sql) の内容を一度実行します。空のテーブル3つと取得用の関数を作成します。
3. プロジェクトの接続情報から Project URL、Settings → API Keysからsecret key（`sb_secret_...`）を取得します。Data APIを有効にし、`public`スキーマが公開対象であることを確認してください。
4. `.env.example`を`.env.local`にコピーし、以下の値を設定します。

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=取得したsecretキー
```

5. `npm run dev`を起動（起動中なら再起動）し、URLを開くとそのまま出席表が表示されます。開催日とメンバーを登録してください。

秘密キーはサーバーだけで使います。環境変数に `NEXT_PUBLIC_` を付けず、`.env.local`をコミットしないでください。RLSを有効にし、ブラウザ用の`anon`・`authenticated`ロールによる直接アクセスは許可していません。

このアプリは1チーム用で、URLにアクセスできる人は全員の回答・メンバー・開催日を編集できます。個人アカウントや管理者権限は設けていません。

### 既存のSupabaseに並べ替え機能を追加する場合

SQL Editorで [`supabase/migrations/20260919_member_order.sql`](supabase/migrations/20260919_member_order.sql) を実行してください。既存のメンバー・出欠データを維持して表示順の保存機能を追加します。新規プロジェクトでは `schema.sql` のみで設定できます。

表示順は全開催日で共通で、再読み込みや別のブラウザにも反映されます。新しいメンバーは末尾に追加されます。

### 既存のSupabaseで開催日の重複を防ぐ場合

SQL Editorで [`supabase/migrations/20260919_unique_event_date.sql`](supabase/migrations/20260919_unique_event_date.sql) を実行してください。すでに同じ日付が複数ある場合は、最初に作成した開催日へ統合します。同じメンバーに複数の回答がある場合は、最終更新が新しい回答を残します。

### 古い開催日を自動削除する場合

SQL Editorで [`supabase/migrations/20260919_old_event_cleanup.sql`](supabase/migrations/20260919_old_event_cleanup.sql) を実行してください。今日より前の開催日は新しい30件だけを保持し、31件目以降の開催日と関連する出欠を削除します。実行時に既存データを一度整理し、その後はSupabase Cronが3か月ごと（1月・4月・7月・10月の1日午前3時、日本時間）に処理します。ページ表示時には削除処理を行いません。

Cronの実行結果はSupabase Dashboardの Integrations → Cron → Jobs → History から確認できます。この削除は元に戻せないため、保持件数を変更する場合は移行SQL内の `offset 30` を変更してから実行してください。

### Vercelでの設定

Vercelのプロジェクト → Settings → Environment Variablesに、上記2つの環境変数を設定してデプロイします。変数を追加・変更した場合は再デプロイしてください。本番用とプレビュー用の環境変数の適用先を確認し、テストで本番データを変更したくない場合は別のSupabaseプロジェクトを使ってください。

確認方法：2つのブラウザで同じURLを開き、一方でメンバー・開催日・出欠を保存します。もう一方で10秒以内に反映されること、再読み込み後にも残ることを確認します。

参考：[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 検証

```bash
npm test
npm run lint
npm run build
```

Turbopack の子プロセスがポートを使用できない制限環境では、以下の方法でもビルドできます。

```bash
npm run build -- --webpack
```
