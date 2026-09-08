# Yamazoe Halls — Firebase staging

This repository is initialized for the Firebase project `yamazoe-halls-staging`.
It uses Firebase Hosting, Cloud Functions for Firebase (2nd generation),
Cloud Firestore. Functions run in `asia-northeast1` on Node.js 22.

## Configuration model

Non-sensitive, deploy-time configuration belongs in
`functions/.env.yamazoe-halls-staging` (copy the committed `.example` file).
Credentials are stored only in Google Cloud Secret Manager and are bound only
to the `api` function.

| Purpose | Secret Manager name | Value format |
| --- | --- | --- |
| Gmail OAuth client ID | `GMAIL_OAUTH_CLIENT_ID` | OAuth client ID |
| Gmail OAuth client secret | `GMAIL_OAUTH_CLIENT_SECRET` | OAuth client secret |
| Gmail OAuth refresh token | `GMAIL_OAUTH_REFRESH_TOKEN` | Refresh token created with the required Gmail scopes |
| Calendar service account | `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` | Complete service-account JSON document |

The Google Calendar that is to be synchronized must be explicitly shared with
the service account's `client_email`; do not substitute user OAuth credentials
for Calendar access.

## First-time staging setup

Prerequisites:

1. Firebase CLI authenticated to an account with access to
   `yamazoe-halls-staging`.
2. The project is on the Blaze plan, required by 2nd-generation Functions and
   Secret Manager.
3. Node.js 22 and npm installed locally.

Install dependencies and select staging:

```sh
cd functions
npm install
cd ..
firebase use staging
cp functions/.env.yamazoe-halls-staging.example functions/.env.yamazoe-halls-staging
```

Replace the placeholders in `functions/.env.yamazoe-halls-staging`. Then add
the secrets interactively; never put their values on the command line or in a
file committed to Git:

```sh
firebase functions:secrets:set GMAIL_OAUTH_CLIENT_ID --project yamazoe-halls-staging
firebase functions:secrets:set GMAIL_OAUTH_CLIENT_SECRET --project yamazoe-halls-staging
firebase functions:secrets:set GMAIL_OAUTH_REFRESH_TOKEN --project yamazoe-halls-staging
firebase functions:secrets:set GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON --project yamazoe-halls-staging
```

Deploy the staging configuration:

```sh
firebase deploy --project yamazoe-halls-staging \
  --only functions,hosting,firestore:rules,firestore:indexes
```

The initial Firestore rules deny all direct access. Open narrowly scoped,
tested client rules only after the application’s authorization model is
defined. After deployment, verify `https://yamazoe-halls-staging.web.app/api/health`.

## Local development

Populate `functions/.secret.local` only on a developer workstation for the
Firebase emulator. It is ignored by Git. Start local services with:

```sh
cd functions
npm run serve
```
