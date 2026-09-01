#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example, add the provider keys locally, and retry." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PROJECT_ID="${GCP_PROJECT_ID:-payoff-507012}"

gcloud services enable secretmanager.googleapis.com --project "$PROJECT_ID"

for SECRET_NAME in OPENAI_API_KEY GEMINI_API_KEY; do
  SECRET_VALUE="${!SECRET_NAME:-}"
  if [[ -z "$SECRET_VALUE" ]]; then
    echo "$SECRET_NAME is empty in $ENV_FILE." >&2
    exit 1
  fi
  if gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_NAME" --project "$PROJECT_ID" --data-file=- >/dev/null
    echo "Added a new version to $SECRET_NAME."
  else
    printf '%s' "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" --project "$PROJECT_ID" --replication-policy=automatic --data-file=- >/dev/null
    echo "Created $SECRET_NAME."
  fi
  unset SECRET_VALUE
done
