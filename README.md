# CPE 334 Food Ordering

Food ordering application built with Next.js, Express, Prisma, and PostgreSQL. The root Dockerfile builds a single Cloud Run image containing the web app and API; Docker Compose runs the UI, API, database, and seed locally.

## What is in this folder

| File | What it does |
|---|---|
| `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf` | Images used by Docker Compose: Express API and Next.js frontend served by nginx. |
| `Dockerfile`, `.dockerignore` | Production image for Next.js and Express, running as the non-root `node` user. Cloud Run serves the frontend on `$PORT` (3000); the API listens internally on `API_PORT` (3001). |
| `docker-compose.yml` | Runs PostgreSQL, a migration/seed job, the API (`localhost:3001`) and web app (`localhost:3000`) locally. |
| `.env.example`, `server/.env.example`, `client/.env.example` | Local-only environment examples with placeholders. Copy the root file to `.env` for Docker Compose and never commit `.env`. |
| `server/docker-entrypoint.sh` | Starts the server and nothing else. Migrations run in a separate Cloud Run job. |
| `.github/workflows/ci-docker.yml` | Runs on every Pull Request: PostgreSQL service, migrate and seed, backend and frontend tests, deploy script tests, Docker build. The job name `test-and-docker` is the required check for the ruleset. |
| `.github/workflows/deploy.yml` | Runs on every merge into `main`: CI again, build and push the image tagged with the commit SHA, migration job, Cloud Run update, smoke test. Run it by hand with `image_tag` to roll back. |
| `deploy/deploy.sh` | One-time setup and first deploy: APIs, Artifact Registry, Cloud SQL, secrets, runtime service account, migration job, and Cloud Run service. Run with `DRY_RUN=1` first. |
| `deploy/release.sh` | Called by `deploy.yml`. Checks the image exists, reads its digest, runs the migration job, and updates the service. |
| `deploy/smoke_test.py` | Checks `/api/health`, `/api/ready`, `/`, products, and optional cookie-based sign-in. |
| `deploy/teardown.sh` | Deletes the cloud resources after the course. |
| `deploy/tests/` | Offline tests for the deploy scripts. CI runs them. |
| `.github/dependabot.yml` | Opens a Pull Request every week when a GitHub Action used by the workflows has a newer version. |
| `docs/gcp-first-lab.md` | Step-by-step first deploy from Cloud Shell. |
| `docs/gcp-cicd-guide.md` | GCP setup, local run, CI, troubleshooting, and cost. |
| `docs/auto-deploy.md` | Workload Identity Federation, GitHub environment and variables, ruleset, and rollback. |

The guides are in English. The TA team wrote them during their own rehearsal. Values such as `YOUR_PROJECT_ID`, `YOUR_PROJECT_NUMBER`, and `YOUR_ORG/YOUR_REPO` are placeholders for your own. Commit SHAs and revision names in the guides are examples from the rehearsal.

## Order of work

0. Follow the Lab 5 Student Guide (the episode series from the TA team). This folder is the material it points to.
1. Run your app locally in production mode, then with `docker compose up --build`.
   For Docker Compose, copy `.env.example` to `.env` and replace both password placeholders with unique local values. The seed requires the admin password; it requires the demo password when `SEED_DEMO_DATA=true`.
2. Make it cloud-ready: sessions and uploaded files in the database, no demo passwords in production, reference data and the first administrator created by the seed.
3. Add `ci-docker.yml` and open a Pull Request to see the checks run.
4. Before any real cloud deployment, confirm billing and budget alerts and review the planned resources. `DRY_RUN=1 PROJECT_ID=YOUR_PROJECT_ID bash deploy/deploy.sh` prints the commands without calling GCP. A real deploy creates paid resources; do not run it until your team approves.
5. Follow `docs/auto-deploy.md` to create the deploy service account, Workload Identity Federation, the GitHub environment `demo`, and the ruleset for `main`.
6. Add `deploy.yml` and merge a small change into `main`.

## GitHub settings that deploy.yml expects

Environment `demo`, deployable only from `main`, with these variables:

| Name | Example |
|---|---|
| `GCP_PROJECT_ID` | `YOUR_PROJECT_ID` |
| `GCP_REGION` | `asia-southeast1` |
| `WIF_PROVIDER` | `projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| `WIF_SERVICE_ACCOUNT` | `food-ordering-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com` |

Optional: `SMOKE_EMAIL` as a variable and `SMOKE_PASSWORD` as a secret, for the sign-in check. Set both or neither.

Ruleset for `main`: Enforcement Active, empty bypass list, Require a pull request, Require status checks to pass with `test-and-docker` selected through Add checks, and Require branches to be up to date.

## Deployment configuration

Cloud resources use the `food-ordering` name. Review `deploy/deploy.sh`, `deploy/release.sh`, and `deploy/teardown.sh` together before deploying. Database connection and JWT signing secrets are supplied at runtime through Secret Manager. The migration job runs `prisma migrate deploy` and the idempotent seed. Do not put credentials in the image, repository, or workflow output.

## Rollback

Actions > Deploy demo > Run workflow on `main`, then enter the full 40-character commit SHA of the last release that worked. The workflow skips tests, build, and migration, deploys that image, and runs the smoke test. The database schema is not rolled back, so keep migrations additive.

## Cost

Cloud SQL is billed for every hour it exists. The TA team estimated about USD 14 to 18 per project per month with light use in October 2026. Create the budget alert before anything else, and run `deploy/teardown.sh` when the course ends.
