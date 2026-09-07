import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";

// Staging workload location. Keep all future Functions in this region unless
// a product requirement calls for a deliberate multi-region design.
setGlobalOptions({ region: "asia-northeast1", maxInstances: 10 });

// Gmail OAuth uses a refresh token; credentials must never be committed to the
// repository or placed in a non-secret .env file.
const gmailOAuthClientId = defineSecret("GMAIL_OAUTH_CLIENT_ID");
const gmailOAuthClientSecret = defineSecret("GMAIL_OAUTH_CLIENT_SECRET");
const gmailOAuthRefreshToken = defineSecret("GMAIL_OAUTH_REFRESH_TOKEN");

// Store the entire service-account JSON in one Secret Manager secret. The
// calendar itself must be shared with the service account's client_email.
const calendarServiceAccountJson = defineSecret(
  "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON",
);

// Non-sensitive configuration is supplied by functions/.env.yamazoe-halls-staging.
const appEnvironment = defineString("APP_ENV", { default: "staging" });
const calendarId = defineString("GOOGLE_CALENDAR_ID");

export const api = onRequest(
  {
    cors: false,
    secrets: [
      gmailOAuthClientId,
      gmailOAuthClientSecret,
      gmailOAuthRefreshToken,
      calendarServiceAccountJson,
    ],
  },
  (request, response) => {
    if (
      request.method !== "GET" ||
      !["/health", "/api/health"].includes(request.path)
    ) {
      response.status(404).json({ error: "Not found" });
      return;
    }

    // Do not expose secret values. The health endpoint only proves the API is
    // deployed and identifies its non-sensitive staging configuration.
    response.status(200).json({
      status: "ok",
      environment: appEnvironment.value(),
      calendarConfigured: Boolean(calendarId.value()),
    });
  },
);
