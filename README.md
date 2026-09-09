# Yamazoe Halls — Firebase staging

`yamazoe-halls-staging` の Firebase Hosting と Cloud Firestore だけで動作する、ログイン不要の予約フォームです。Cloud Functions、Gmail、Google Calendar、Cloud Storage は使用しません。

公開ページの表題は「山添村公民館予約フォーム」です。館、施設（部屋）、利用日、利用区分（午前・午後・夜間・全日）、氏名、電話番号、利用目的、備考（任意）を受け付けます。

トップページには館・施設（部屋）の選択、月間カレンダー、日別の利用区分一覧を表示します。青は空き、灰色は受付中、赤は停止です。公開側には個人情報を含まない `availability` コレクションだけを公開し、空き枠から同一ページ内の予約フォームへ進めます。

部屋マスタは、東山（１階 大会議室・１階 料理実習室・２階 和室（大）・２階 和室（小）・２階 研修室）、波多野公民館（文化伝習館）（研修室）、豊原（大研修室・研修室・料理実習室）です。東山のロビー・図書室は予約対象に含めません。

休館日は `closedDays/{facilityId_yyyyMMdd}` で管理します。職員画面では館ごとの曜日・祝日テンプレートを対象月へ適用し、内容確認後に一括登録できます。登録済み休館日は月ごとに一覧表示され、例外開館時は確認ダイアログを経て個別削除できます。削除は `closedDayAuditLogs` に職員メール・日時・館・日付を記録します。

`closedDays` には `facilityId`、`date`、`weekday`、`isHoliday`、`holidayName`、`createdBy`、`createdAt` を保存します。公開カレンダー用には個人情報を持たない `closureAvailability` も同時に作成し、休館日データは予約状況より優先して赤の「停止」として表示します。

## Reservation model

予約は `reservations/{facility}_{room}_{date}_{slot}` に1件ずつ保存されます。たとえば東山公民館の１階 大会議室・午前枠は `higashiyama_higashiyama_1f_large_meeting_room_2026-09-09_morning` です。同じ館・部屋・利用日・利用区分は同一ドキュメントIDとなり、Firestore ルールは新規作成だけを許可するため、最初に送信された予約だけが受け付けられます。

| Field | Description |
| --- | --- |
| `slotId` | 館・部屋・利用日・利用区分から生成される予約枠ID |
| `facility`, `room` | 館ID・部屋ID（例: `higashiyama`, `higashiyama_1f_large_meeting_room`） |
| `date`, `slot` | 利用日・利用区分ID（例: `morning`） |
| `customerName`, `phone`, `purpose`, `notes` | お客様入力 |
| `status` | 初期値は `pending` |
| `createdAt` | Firestore サーバー時刻 |

公開フォームは予約の作成だけが可能です。個人情報を含む予約データの閲覧、更新、削除は Firebase コンソールなどの管理者環境で行ってください。

予約送信時には、同じ固定IDで `availability/{facility}_{room}_{date}_{slot}` も原子的に作成します。公開側が読めるのは、館・部屋・日付・利用区分・状態だけです。

## Staff management

`/admin.html` は職員用の管理画面です。Firebase Authentication のメール／パスワードでログインしたうえで、ID トークンに `admin: true` カスタムクレームがある職員だけが、予約一覧の閲覧・予約詳細の編集・削除を行えます。

初回設定では、Firebase Console の Authentication でメール／パスワードのログイン方法を有効にし、職員アカウントを作成してください。次に、信頼された管理者環境から Firebase Admin SDK の `setCustomUserClaims(uid, { admin: true })` を実行して対象アカウントへ職員クレームを付与します。クレームの更新後は、その職員が再ログインして新しい ID トークンを取得する必要があります。

館・施設（部屋）・利用日・利用区分は公開フォームの固定枠IDと一致させるため、管理画面からは変更できません。変更が必要な場合は、既存予約を削除して新しい枠を作成してください。

### Staff account bootstrap

`scripts/bootstrap-staff.mjs` は、館長と各館職員のメール／パスワードアカウントを作成し、次のカスタムクレームを付与します。

| Account | Role | Facility |
| --- | --- | --- |
| `kouminkanchou@yamazoe.local` | `manager` | `all` |
| `higashiyama1@yamazoe.local` | `staff` | `higashiyama` |
| `hatano1@yamazoe.local` | `staff` | `hatano` |
| `toyohara1@yamazoe.local` | `staff` | `toyohara` |

信頼できる管理者環境で、Firebase Admin SDK とサービスアカウント認証を用意してから実行します。`STAFF_INITIAL_PASSWORD` は Firebase の要件により6文字以上が必要です。クレームの反映後、職員は一度ログアウトして再ログインしてください。

```sh
npm install --no-save firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
STAFF_INITIAL_PASSWORD='6文字以上の初期パスワード' \
node scripts/bootstrap-staff.mjs
```

## Deploy

Firebase CLI で次を実行します。

```sh
firebase deploy --project yamazoe-halls-staging \
  --only hosting,firestore:rules,firestore:indexes
```

公開先は `https://yamazoe-halls-staging.web.app` です。
