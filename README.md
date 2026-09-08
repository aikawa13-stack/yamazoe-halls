# Yamazoe Halls — Firebase staging

`yamazoe-halls-staging` の Firebase Hosting と Cloud Firestore だけで動作する、ログイン不要の予約フォームです。Cloud Functions、Gmail、Google Calendar、Cloud Storage は使用しません。

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
