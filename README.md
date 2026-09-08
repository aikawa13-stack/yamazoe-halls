# Yamazoe Halls — Firebase staging

`yamazoe-halls-staging` の Firebase Hosting と Cloud Firestore だけで動作する、ログイン不要の予約フォームです。Cloud Functions、Gmail、Google Calendar、Cloud Storage は使用しません。

## Reservation model

予約は `reservationSlots/{YYYY-MM-DD_HH-mm}` に1件ずつ保存されます。同じ日時は同一ドキュメントIDとなり、Firestore ルールは新規作成だけを許可するため、最初に送信された予約だけが受け付けられます。

| Field | Description |
| --- | --- |
| `slotId` | 日付と開始時間から生成される予約枠ID |
| `date`, `time` | 利用日・開始時間 |
| `guestCount` | 1–12名 |
| `customerName`, `email`, `phone`, `notes` | お客様入力 |
| `status` | 初期値は `pending` |
| `createdAt` | Firestore サーバー時刻 |

公開フォームは予約の作成だけが可能です。個人情報を含む予約データの閲覧、更新、削除は Firebase コンソールなどの管理者環境で行ってください。

## Deploy

Firebase CLI で次を実行します。

```sh
firebase deploy --project yamazoe-halls-staging \
  --only hosting,firestore:rules,firestore:indexes
```

公開先は `https://yamazoe-halls-staging.web.app` です。
