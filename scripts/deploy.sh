#!/usr/bin/env bash
# One-command deploy to Google Cloud Run. Usage: PROJECT_ID=my-project ./scripts/deploy.sh
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-south1}"   # Mumbai
SERVICE="${SERVICE:-thunai}"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com
gcloud firestore databases create --location="$REGION" 2>/dev/null || echo "Firestore already exists"

SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 24)}"

gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,SESSION_SECRET=$SESSION_SECRET,CRON_SECRET=$CRON_SECRET,GEMINI_API_KEY=${GEMINI_API_KEY:-},SMTP_HOST=${SMTP_HOST:-},SMTP_USER=${SMTP_USER:-},SMTP_PASS=${SMTP_PASS:-},MAIL_FROM=${MAIL_FROM:-Thunai Care <no-reply@thunai.local>}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars "APP_URL=$URL"

# Cloud Scheduler pokes the reminder engine every 5 minutes.
gcloud scheduler jobs delete thunai-tick --location "$REGION" --quiet 2>/dev/null || true
gcloud scheduler jobs create http thunai-tick --location "$REGION" --schedule "*/5 * * * *" \
  --uri "$URL/api/cron/tick" --http-method POST --headers "x-cron-secret=$CRON_SECRET"

echo "Deployed: $URL"
