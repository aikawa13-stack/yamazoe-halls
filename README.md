# Yamazoe Halls — Firebase staging

`yamazoe-halls-staging` の Firebase Hosting と Cloud Firestore だけで動作する、ログイン不要の予約フォームです。Cloud Functions、Gmail、Google Calendar、Cloud Storage は使用しません。

公開ページの表題は「山添村公民館予約フォーム」です。利用施設（東山・波多野・豊原）、利用日、利用区分（午前・午後・夜間・全日）、氏名、電話番号、利用目的、備考（任意）を受け付けます。

トップページには施設選択、月間カレンダー、日別の利用区分一覧を表示します。青は空き、灰色は受付中、赤は停止です。公開側には個人情報を含まない `availability` コレクションだけを公開し、空き枠から同一ページ内の予約フォームへ進めます。

休館日は `closed_days/{facility}/dates/{date}` で管理します。Firestore の文書パスはコレクションと文書を交互に置く必要があるため、`dates` サブコレクションを使用しています。休館日データは予約状況より優先され、公開カレンダーと利用区分一覧に赤の「停止」として表示されます。職員画面から設定・解除できます。

## Reservation model

予約は `reservations/{facility}_{date}_{slot}` に1件ずつ保存されます。たとえば東山の午前枠は `東山_2026-09-08_午前` です。同じ施設・利用日・利用区分は同一ドキュメントIDとなり、Firestore ルールは新規作成だけを許可するため、最初に送信された予約だけが受け付けられます。

| Field | Description |
| --- | --- |
| `slotId` | 施設・利用日・利用区分から生成される予約枠ID |
| `facility` | 東山・波多野・豊原 |
| `date`, `slot` | 利用日・利用区分（午前・午後・夜間・全日） |
| `customerName`, `phone`, `purpose`, `notes` | お客様入力 |
| `status` | 初期値は `pending` |
| `createdAt` | Firestore サーバー時刻 |

公開フォームは予約の作成だけが可能です。個人情報を含む予約データの閲覧、更新、削除は Firebase コンソールなどの管理者環境で行ってください。

予約送信時には、同じ固定IDで `availability/{facility}_{date}_{slot}` も原子的に作成します。公開側が読めるのは、施設・日付・利用区分・状態だけです。

## Staff management

`/admin.html` は職員用の管理画面です。Firebase Authentication のメール／パスワードでログインしたうえで、ID トークンに `admin: true` カスタムクレームがある職員だけが、予約一覧の閲覧・予約詳細の編集・削除を行えます。

初回設定では、Firebase Console の Authentication でメール／パスワードのログイン方法を有効にし、職員アカウントを作成してください。次に、信頼された管理者環境から Firebase Admin SDK の `setCustomUserClaims(uid, { admin: true })` を実行して対象アカウントへ職員クレームを付与します。クレームの更新後は、その職員が再ログインして新しい ID トークンを取得する必要があります。

利用施設・利用日・利用区分は公開フォームの固定枠IDと一致させるため、管理画面からは変更できません。変更が必要な場合は、既存予約を削除して新しい枠を作成してください。

## Deploy

Firebase CLI で次を実行します。

```sh
firebase deploy --project yamazoe-halls-staging \
  --only hosting,firestore:rules,firestore:indexes
```

公開先は `https://yamazoe-halls-staging.web.app` です。
