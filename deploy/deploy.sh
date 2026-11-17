#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# TokTickIT — Idempotent Google Cloud Run Deployment Script
# ==============================================================================
# Usage:
#   ./deploy/deploy.sh [--demo]
#
# Environment Variables (Optional):
#   PROJECT_ID   GCP Project ID (defaults to active gcloud config project)
#   REGION       GCP Region (default: asia-southeast1)
#   DRY_RUN      Set DRY_RUN=1 to print all gcloud commands without executing
#
# WHAT THIS SCRIPT DOES  (one-time / manual first setup; safe to re-run)
#   Creates every cloud resource the app needs and does the first deployment:
#   1 enable APIs     2 Artifact Registry  3 Cloud SQL instance  4 database
#   5 runtime SA+IAM  6 DB user + secret   7 admin password      8 demo password
#   (secret access)   9 build image        10 migrate+seed job   11 Cloud Run service
#   After this, routine releases are done by GitHub Actions (deploy.yml ->
#   deploy/release.sh), which only UPDATES these resources.
#
# ⭐ IMPORTANT
#   - Idempotent: existing resources/secrets are reused, never overwritten
#     (a re-run does not replace credentials).
#   - Passwords are generated with openssl and live only in Secret Manager;
#     they are never printed (run_cmd redacts --password=...).
#   - Preview first with:  DRY_RUN=1 ./deploy/deploy.sh   (no gcloud calls)
#   - Run from the REPO ROOT (step 9 builds the root Dockerfile).
#   - Offline test: deploy/tests/test_deploy_stub.sh
#
# REFERENCES
#   - gcloud run deploy : https://cloud.google.com/sdk/gcloud/reference/run/deploy
#   - Cloud Run jobs    : https://cloud.google.com/run/docs/create-jobs
#   - Cloud SQL + Run   : https://cloud.google.com/sql/docs/postgres/connect-run
#   - Secret Manager    : https://cloud.google.com/secret-manager/docs
#   - Artifact Registry : https://cloud.google.com/artifact-registry/docs/docker
#
# ⭐ CHANGE ME — groups using another tech stack must review (marked below):
#   # CHANGE ME: resource names (REPO_NAME, SQL_INSTANCE, SERVICE_NAME, ...)
#   # CHANGE ME: database engine/version (steps 3, 4, 6)
#   # CHANGE ME: migrate/seed command of the Cloud Run job (step 10)
#   # CHANGE ME: port / memory / scaling flags (step 11)
# ==============================================================================

# ------------------------------------------------------------------------------
# Settings & argument parsing
# ------------------------------------------------------------------------------
DRY_RUN="${DRY_RUN:-0}"
# CHANGE ME: default region if your group uses another one.
REGION="${REGION:-asia-southeast1}"
SEED_DEMO_DATA="false"

for arg in "$@"; do
  case "$arg" in
    --demo)
      SEED_DEMO_DATA="true"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--demo]" >&2
      exit 1
      ;;
  esac
done

# Helper: prints the command (DRY_RUN=1) or prints then executes it.
# ⭐ IMPORTANT: --password=... is redacted in the log; keep this behaviour.
run_cmd() {
  # Log the command without exposing generated database credentials.
  local arg
  if [ "$DRY_RUN" = "1" ]; then
    printf '[DRY_RUN] '
  else
    printf '+ '
  fi
  for arg in "$@"; do
    case "$arg" in
      --password=*) printf '%s ' '--password=<REDACTED>' ;;
      *) printf '%q ' "$arg" ;;
    esac
  done
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then
    "$@"
  fi
}

# Resolve the GCP project: $PROJECT_ID, else the active gcloud project.
if [ "$DRY_RUN" = "1" ]; then
  PROJECT_ID="${PROJECT_ID:-example-gcp-project}"
else
  PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  if [ -z "$PROJECT_ID" ]; then
    echo "Error: PROJECT_ID is not set and no active gcloud project was found." >&2
    echo "Run: gcloud config set project YOUR_PROJECT_ID" >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# Resource names
# ⚠️ The lab guide refers to these names (toktickit, toktickit-pg,
#    toktickit-runner, ...) and deploy.yml / release.sh / teardown.sh use the
#    same ones. Keep them unless the guide says otherwise.
# CHANGE ME: rename only if your group uses its own naming (then rename it in
#            deploy.yml, release.sh, teardown.sh and the tests too).
# ------------------------------------------------------------------------------
REPO_NAME="toktickit"
SQL_INSTANCE="toktickit-pg"
DB_NAME="toktickit"
DB_USER="toktickit"
SERVICE_NAME="toktickit"
MIGRATE_JOB_NAME="toktickit-migrate"
SA_NAME="toktickit-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

# Secret Manager secret names (values are never stored in this repo).
SECRET_DB_URL="toktickit-database-url"
SECRET_ADMIN_PASS="toktickit-admin-password"
SECRET_DEMO_PASS="toktickit-demo-password"

GENERATED_ADMIN_PASSWORD=""
GENERATED_DEMO_PASSWORD=""

echo "=================================================================="
echo "TokTickIT Cloud Run Deployment"
echo "Project : ${PROJECT_ID}"
echo "Region  : ${REGION}"
echo "Demo    : ${SEED_DEMO_DATA}"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

# ==============================================================================
# 1. Enable required GCP APIs
# ==============================================================================
run_cmd gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project "$PROJECT_ID"

# ==============================================================================
# 2. Create Artifact Registry repository (idempotent)
#    Stores the container images (deploy.yml pushes one per commit SHA).
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID"
  run_cmd gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location "$REGION" --description="TokTickIT container repository" --project "$PROJECT_ID"
else
  if ! gcloud artifacts repositories describe "$REPO_NAME" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud artifacts repositories create "$REPO_NAME" \
      --repository-format=docker \
      --location "$REGION" \
      --description="TokTickIT container repository" \
      --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 3. Create Cloud SQL for PostgreSQL instance (idempotent, db-f1-micro requires --edition=enterprise on POSTGRES_16)
#    ⭐ IMPORTANT: keep `--edition=enterprise` (lowercase) — required by
#       db-f1-micro and asserted by deploy/tests/test_deploy_stub.sh.
#       Creating the instance takes several minutes and costs money until
#       deploy/teardown.sh is run.
#    CHANGE ME: --database-version / --tier for a different database.
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID"
  run_cmd gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro --region="$REGION" --storage-size=10GB --storage-type=SSD --backup-start-time=03:00 --project "$PROJECT_ID"
else
  if ! gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud sql instances create "$SQL_INSTANCE" \
      --database-version=POSTGRES_16 \
      --edition=enterprise \
      --tier=db-f1-micro \
      --region="$REGION" \
      --storage-size=10GB \
      --storage-type=SSD \
      --backup-start-time=03:00 \
      --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 4. Create Database (idempotent)
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
  run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
else
  if ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 5. Create Dedicated Runtime Service Account & IAM bindings (idempotent)
#    The app runs as this account with least privilege. Here it only gets
#    cloudsql.client (connect to the DB); access to individual secrets is
#    granted later, per secret, after they exist.
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID"
  run_cmd gcloud iam service-accounts create "$SA_NAME" --display-name="TokTickIT Cloud Run Service Account" --project "$PROJECT_ID"
else
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    run_cmd gcloud iam service-accounts create "$SA_NAME" \
      --display-name="TokTickIT Cloud Run Service Account" \
      --project "$PROJECT_ID"
  fi
fi

run_cmd gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client" \
  --condition=None \
  --quiet

# ==============================================================================
# 6. Create DB User & Store DATABASE_URL in Secret Manager (only if secret does not exist yet)
#    ⭐ IMPORTANT: the DB user's password and the password inside DATABASE_URL
#       must be the same value (checked by test_deploy_stub.sh). Never echo it.
#    CHANGE ME: the URL format below is PostgreSQL + Prisma specific
#       (host=/cloudsql/... unix socket, schema=public, connection_limit=3).
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_DB_URL" --project "$PROJECT_ID"
  run_cmd gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format="value(name)"
  run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="<GENERATED_HEX_PASSWORD>" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_DB_URL" --project "$PROJECT_ID" >/dev/null 2>&1; then
    DB_PASS="$(openssl rand -hex 24)"
    if gcloud sql users list --instance="$SQL_INSTANCE" --project "$PROJECT_ID" --format="value(name)" | grep -qx "$DB_USER"; then
      run_cmd gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project "$PROJECT_ID"
    else
      run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project "$PROJECT_ID"
    fi
    DB_URL_VALUE="postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONN_NAME}&schema=public&connection_limit=3"
    run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$DB_URL_VALUE" | gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 7. Create ADMIN_PASSWORD in Secret Manager (only if secret does not exist yet)
#    Read it later with: gcloud secrets versions access latest --secret=<name>
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  run_cmd gcloud secrets describe "$SECRET_ADMIN_PASS" --project "$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_ADMIN_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
  run_cmd gcloud secrets versions add "$SECRET_ADMIN_PASS" --data-file=- --project "$PROJECT_ID"
else
  if ! gcloud secrets describe "$SECRET_ADMIN_PASS" --project "$PROJECT_ID" >/dev/null 2>&1; then
    GENERATED_ADMIN_PASSWORD="$(openssl rand -base64 16 | tr -d '/+=' | cut -c1-14)Aa1!"
    run_cmd gcloud secrets create "$SECRET_ADMIN_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
    printf "%s" "$GENERATED_ADMIN_PASSWORD" | gcloud secrets versions add "$SECRET_ADMIN_PASS" --data-file=- --project "$PROJECT_ID"
  fi
fi

# ==============================================================================
# 8. Optional Demo Password in Secret Manager when --demo is passed
#    Only used to seed demo users (./deploy/deploy.sh --demo).
# ==============================================================================
JOB_SECRETS="DATABASE_URL=${SECRET_DB_URL}:latest,ADMIN_PASSWORD=${SECRET_ADMIN_PASS}:latest"
if [ "$SEED_DEMO_DATA" = "true" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    run_cmd gcloud secrets describe "$SECRET_DEMO_PASS" --project "$PROJECT_ID"
    run_cmd gcloud secrets create "$SECRET_DEMO_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
    run_cmd gcloud secrets versions add "$SECRET_DEMO_PASS" --data-file=- --project "$PROJECT_ID"
  else
    if ! gcloud secrets describe "$SECRET_DEMO_PASS" --project "$PROJECT_ID" >/dev/null 2>&1; then
      GENERATED_DEMO_PASSWORD="$(openssl rand -base64 16 | tr -d '/+=' | cut -c1-14)Dd1!"
      run_cmd gcloud secrets create "$SECRET_DEMO_PASS" --replication-policy="automatic" --project "$PROJECT_ID"
      printf "%s" "$GENERATED_DEMO_PASSWORD" | gcloud secrets versions add "$SECRET_DEMO_PASS" --data-file=- --project "$PROJECT_ID"
    fi
  fi
  JOB_SECRETS="${JOB_SECRETS},DEMO_USER_PASSWORD=${SECRET_DEMO_PASS}:latest"
fi

# ------------------------------------------------------------------------------
# Secret access (per secret, NOT project-wide)
# ⭐ IMPORTANT: test_deploy_stub.sh fails if a project-wide secretAccessor
#    binding is added — keep access limited to this app's own secrets.
# ------------------------------------------------------------------------------
# Grant access only to this app's secrets, after they exist.
RUNTIME_SECRETS=("$SECRET_DB_URL" "$SECRET_ADMIN_PASS")
if [ "$SEED_DEMO_DATA" = "true" ]; then
  RUNTIME_SECRETS+=("$SECRET_DEMO_PASS")
fi
for secret in "${RUNTIME_SECRETS[@]}"; do
  run_cmd gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT_ID" --quiet
done

# ==============================================================================
# 9. Build & Push Unified Container Image via Cloud Build
#    Builds the root Dockerfile (run this script from the repo root).
#    Tag `latest` is only for this first manual setup; deploy.yml uses commit SHAs.
# ==============================================================================
run_cmd gcloud builds submit \
  --tag "$IMAGE_URI" \
  --project "$PROJECT_ID"

# ==============================================================================
# 10. Create/Update & Execute Cloud Run Job for Migration + Non-destructive Seed
#     ⭐ IMPORTANT: if this job fails the script stops BEFORE deploying the
#        service, so a broken migration never reaches users.
#     CHANGE ME: `--args` (prisma migrate deploy && npm run prisma:seed) is
#        Prisma/npm specific — use your stack's migrate/seed command.
#     deploy.yml / release.sh later re-run this same job (name: toktickit-migrate).
# ==============================================================================
run_cmd gcloud run jobs deploy "$MIGRATE_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "$JOB_SECRETS" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,SEED_DEMO_DATA=${SEED_DEMO_DATA}" \
  --command "sh" \
  --args "-c,npx prisma migrate deploy && npm run prisma:seed" \
  --max-retries 1 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run migration job '${MIGRATE_JOB_NAME}' failed. Aborting service deployment." >&2
  printf '%s\n' "View job logs with:" >&2
  printf '%s\n' "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}\" --project \"${PROJECT_ID}\" --limit 50 --format=\"value(textPayload)\"" >&2
  exit 1
fi

# ==============================================================================
# 11. Deploy Cloud Run Service
#     CHANGE ME: --port must equal the port in the Dockerfile (3000); tune
#                --memory / --cpu / --max-instances for your app.
#     ⚠️ --allow-unauthenticated makes the service public (needed for the demo).
# ==============================================================================
run_cmd gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_DB_URL}:latest" \
  --set-env-vars "NODE_ENV=production,TZ=Asia/Bangkok" \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --project "$PROJECT_ID"

if [ "$DRY_RUN" = "1" ]; then
  SERVICE_URL="https://${SERVICE_NAME}-<hash>-as.a.run.app"
else
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

# ------------------------------------------------------------------------------
# Summary output (URLs; passwords stay in Secret Manager and are not printed)
# ------------------------------------------------------------------------------
printf '\n'
printf '%s\n' "=================================================================="
printf '%s\n' "Deployment Completed!"
printf '%s\n' "Service URL    : ${SERVICE_URL}"
printf '%s\n' "Health Check   : ${SERVICE_URL}/api/health"
printf '%s\n' "Readiness Check: ${SERVICE_URL}/api/ready"
printf '%s\n' "Admin Email    : john.smith@example.com (mustChangePassword: true)"
printf '%s\n' "Admin Password : Stored in Secret Manager: ${SECRET_ADMIN_PASS} (not printed)."
if [ "$SEED_DEMO_DATA" = "true" ]; then
  printf '%s\n' "Demo Password  : Stored in Secret Manager: ${SECRET_DEMO_PASS} (not printed)."
fi
printf '%s\n' "=================================================================="
