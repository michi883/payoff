#!/usr/bin/env bash
set -euo pipefail

CONFIGURED_PROJECT="$(gcloud config get-value project 2>/dev/null)"
PROJECT_ID="${GCP_PROJECT_ID:-$CONFIGURED_PROJECT}"
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "No Google Cloud project configured. Set GCP_PROJECT_ID or run: gcloud config set project PROJECT_ID" >&2
  exit 1
fi
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-payoff}"
REPOSITORY="${ARTIFACT_REPOSITORY:-payoff}"
RUNTIME_ACCOUNT_NAME="${CLOUD_RUN_SERVICE_ACCOUNT:-payoff-cloud-run}"
OPENAI_MODEL_NAME="${OPENAI_MODEL:-gpt-5.4-mini}"
SCENE_REVIEW_MODEL_NAME="${OPENAI_SCENE_REVIEW_MODEL:-gpt-5.4}"
GEMINI_MODEL_NAME="${GEMINI_IMAGE_MODEL:-gemini-3.1-flash-lite-image}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_ACCOUNT="${RUNTIME_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DEFAULT_COMPUTE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
LEGACY_BUILD_ACCOUNT="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
ACTIVE_ACCOUNT_KIND="user"
if [[ "$ACTIVE_ACCOUNT" == *".gserviceaccount.com" ]]; then
  ACTIVE_ACCOUNT_KIND="serviceAccount"
fi
IMAGE_TAG="${IMAGE_TAG:-$(date -u +%Y%m%d-%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "Preparing Google Cloud project $PROJECT_ID in $REGION..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID"

if ! gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" \
    --repository-format=docker \
    --location "$REGION" \
    --description="Payoff Cloud Run images" \
    --project "$PROJECT_ID"
fi

if ! gcloud iam service-accounts describe "$RUNTIME_ACCOUNT" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_ACCOUNT_NAME" \
    --display-name="Payoff Cloud Run runtime" \
    --project "$PROJECT_ID"
fi

# Newer GCP projects may run Cloud Build as the default Compute account without
# the historical Editor grant. These explicit least-purpose roles address that
# 2024 IAM change and allow the build to upload its image.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="${ACTIVE_ACCOUNT_KIND}:${ACTIVE_ACCOUNT}" \
  --role="roles/cloudbuild.builds.editor" \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEFAULT_COMPUTE_ACCOUNT}" \
  --role="roles/cloudbuild.builds.builder" \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEFAULT_COMPUTE_ACCOUNT}" \
  --role="roles/artifactregistry.writer" \
  --condition=None >/dev/null
if gcloud iam service-accounts describe "$LEGACY_BUILD_ACCOUNT" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${LEGACY_BUILD_ACCOUNT}" \
    --role="roles/artifactregistry.writer" \
    --condition=None >/dev/null
fi

for SECRET_NAME in OPENAI_API_KEY GEMINI_API_KEY; do
  if ! gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Missing Secret Manager secret $SECRET_NAME." >&2
    echo "Run ./scripts/configure-cloud-run-secrets.sh before deploying." >&2
    exit 1
  fi
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None >/dev/null
done

echo "Building $IMAGE..."
gcloud builds submit "$REPOSITORY_ROOT" \
  --project "$PROJECT_ID" \
  --tag "$IMAGE" \
  --timeout=30m

echo "Deploying $SERVICE_NAME..."
gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --platform=managed \
  --execution-environment=gen2 \
  --service-account "$RUNTIME_ACCOUNT" \
  --port=8080 \
  --cpu=4 \
  --memory=4Gi \
  --concurrency=4 \
  --timeout=600 \
  --min-instances="$MIN_INSTANCES" \
  --max-instances=10 \
  --cpu-boost \
  --set-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="OPENAI_MODEL=${OPENAI_MODEL_NAME},OPENAI_SCENE_REVIEW_MODEL=${SCENE_REVIEW_MODEL_NAME},GEMINI_IMAGE_MODEL=${GEMINI_MODEL_NAME}" \
  --allow-unauthenticated \
  --labels="app=payoff,managed-by=gcloud"

gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)'
