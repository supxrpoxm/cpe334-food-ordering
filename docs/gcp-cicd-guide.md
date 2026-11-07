# GCP and CI/CD Guide for TokTickIT

This guide explains how the TokTickIT reference is deployed to Google Cloud and released through GitHub Actions. The TA team verified it on 21 October 2026 (Asia/Bangkok). For a short hands-on version, start with [First Practice](gcp-first-lab.md). Automatic deployment and rollback are in [Auto Deploy](auto-deploy.md).

Account, billing, and credit status change over time. Check your own account and project before you use any value from this guide.

## 1. What the reference contains

| Part | Technology and files |
|---|---|
| Frontend | React 18, TypeScript, Vite, Bootstrap; `client/` |
| Backend | Express, TypeScript, Prisma 5; `server/` |
| Database | PostgreSQL; Docker Compose uses PostgreSQL 16 |
| Cloud container | `Dockerfile` at the root, UI and API in one container on port 3000, running as the non-root `node` user |
| Local environment | `docker-compose.yml`: database, migration and seed, backend, frontend |
| Cloud setup | `deploy/deploy.sh`: Cloud Run, Cloud SQL for PostgreSQL 16, Artifact Registry, Cloud Build, Secret Manager, runtime service account |
| CI | `.github/workflows/ci-docker.yml` |
| CD | `.github/workflows/deploy.yml` and `deploy/release.sh` |
| Health and readiness | `/api/health` and `/api/ready` |

`deploy.sh` runs in this order: enable APIs, prepare the registry, database, secrets, and IAM, build the image, run the migration job, then deploy the service once the job succeeds.

The script's defaults are region `asia-southeast1`, Cloud SQL `db-f1-micro` with a 10 GB SSD, and Cloud Run with minimum 0 and maximum 3 instances, 1 CPU, and 512 MiB of memory. These are the values in the source. They have not been checked against your quota, needs, or real cost.

## 2. Before you start

1. Make sure your computer has enough free space for dependencies, Docker layers, and the database before installing anything.
2. Check Node.js, npm, Docker, and Docker Compose for the option you choose. The reference images and CI use Node.js 24; locally, use Node.js 24 and PostgreSQL 15 or later.
3. Check the Google account you will use and its real billing or credit status. Having a billing account is not enough.
4. Check the target project, your IAM permissions, the organization policies, and the region before enabling APIs or creating resources.
5. Set a budget and choose who receives the alerts before you deploy (Student Guide 1.5). Choose an alerts-only budget. An alert notifies you and does not stop spending. Budgets & caps also offers spend cap enforcement, which pauses services when the cap is reached, so your app could stop during class or grading. The Student Guide recommends alerts only.

## 3. Run it locally before going to the cloud

### Option A: Docker Compose

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/ready
```

Open the UI at `http://localhost:5173` and sign in with the seed accounts for this environment.

Compose has fallback passwords and turns on the demo seed for practice on localhost. Never use this file to run a public service. Compose stores data in a Docker volume. Do not delete the volume if you want to keep your practice data.

### Option B: Node.js with the UI and API separate

Prepare a PostgreSQL database and set `DATABASE_URL` in `server/.env` to match it. Then use two terminals:

```bash
cd server
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

```bash
cd client
cp .env.example .env
npm ci
npm run dev
```

Always edit `.env` before you migrate or seed, and never share a real database with the test suite. Do not commit `.env` or any credential.

## 4. What CI does

A Pull Request into `main` runs CI directly. A push to `main` runs the same CI from the deploy workflow before the release. CI:

1. starts a PostgreSQL 16 service on the GitHub runner;
2. uses Node.js 24 and Python 3.14, and tests the deploy scripts offline, without reaching GCP;
3. backend: `npm ci`, migrate, seed, and `npm test`;
4. frontend: `npm ci`, `npm test`, and `npm run build`; and
5. builds the Dockerfile with the UI and API together.

After CI passes on `main`, a separate CD job pushes the image, runs the migration, deploys, and runs the public smoke test. See [Auto Deploy](auto-deploy.md). The Playwright end-to-end tests have not been run against the cloud.

## 5. Prepare the first deploy

For a new environment, always check billing, the budget, the project, IAM, and the source first.

Read the commands the script will run, without calling GCP:

```bash
DRY_RUN=1 PROJECT_ID=YOUR_PROJECT_ID REGION=asia-southeast1 bash deploy/deploy.sh
```

A dry run prints both the check commands and the create commands so you can follow the flow. It does not check IAM, quota, billing, or price, and it does not prove the resources can be created.

Points to know about the script before you run it for real:

- It hides `--password` arguments and does not print the initial administrator or demo passwords. Use a version that has this fix.
- The first deploy from `deploy.sh` tags the image `latest`. Releases from `deploy.yml` tag it with the commit SHA, so roll back only to SHA tags.
- The runtime service account gets Secret Manager Secret Accessor only on this app's secrets, not on the whole project. Keep it that way when you add secrets.
- `--allow-unauthenticated` makes the HTTP endpoint public. Check the app's own authentication and your organization's policy first.
- The demo seed is off by default. `--demo` loads sample data only when the database is empty, with a generated password stored in Secret Manager. Demo accounts are allowed in your project because Lab 6 UAT needs them, but their passwords must never be in code or shown on screen.
- Cloud SQL costs money for as long as it exists. Check the price for your configuration and region.

Once these are clear, run the deploy and record who ran it, the time, the commit, the image digest, the migration execution, and the revision you got.

## 6. Suggested order for the first lab

Use GitHub Actions, Cloud Shell, and the one deploy script. No Terraform, Kubernetes, or Jenkins.

### Part A: look at CI before using the cloud

1. Open a Pull Request in your repository and go to the Checks tab.
2. Walk through Backend Test, Frontend Test and Build, and Docker Build.
3. Read PASS from the real run. The offline script tests only check the deployment flow. They do not test the cloud.

### Part B: deploy once by hand

Do this only after billing is ready and you have read Section 5. Open Cloud Shell with the account for this lab, select your own project, and clone **your own repository**:

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
```

Check the account and project in Cloud Shell every time:

```bash
gcloud auth list
gcloud config get-value project
```

Read the commands first (creates nothing):

```bash
DRY_RUN=1 PROJECT_ID=YOUR_PROJECT_ID bash deploy/deploy.sh
```

When billing, the budget, IAM, and public access are ready, deploy to **your own project only**:

```bash
PROJECT_ID=YOUR_PROJECT_ID bash deploy/deploy.sh
```

This creates paid resources, stores passwords in Secret Manager, and opens a public HTTP endpoint. Do not run it while the Free Trial is still pending.

Open the URL you get, check health and readiness, open Secret Manager on your own to see the initial password, sign in and change it, test the main flow with your team, and record the real results.

### Part C: add CD once Part B works

Automate the same build, migration, and deploy sequence in the pipeline. Set up GitHub-to-GCP authentication with Workload Identity Federation first. Never hand out service account keys, and do not give the pipeline full rights over IAM, secrets, and databases just so it can run the provisioning script again. See [Auto Deploy](auto-deploy.md).

## 7. Acceptance checklist used by the TA team

- Health passes and readiness connects to the database, on both the authenticated and the public URL.
- The UI loads and the API works from the public Cloud Run URL without localhost.
- Each role can sign in through the browser, and a forced password change works.
- A requester can create a ticket and open My Tickets and the ticket details, and ticket ownership is enforced by the API.
- IT staff can choose an owner, record actions taken, and resolve and close a ticket.
- Dashboard counts and permission boundaries are correct for every role.
- Existing sessions and attachments (same bytes and hash) are still there after a rollback and after the current image is restored, and a signed-in user stays signed in after a reload.
- A new commit is deployed through the pipeline, and the revision receiving traffic uses the image from that commit.
- A rollback has been practised, with the migration limitation stated (the schema and data are not rolled back).

End-to-end specs exist in `e2e/`, but there is no root package manifest or Playwright config, and the specs contain localhost URLs and fixed test passwords. Before they can verify the cloud deployment, they need a runner, test accounts, and a base URL.

## 8. Troubleshooting and shutting down

| Symptom | What to check |
|---|---|
| Account sign-up stuck at step 2 | Read the browser message and check free disk space. The first attempt showed FILE_ERROR_NO_SPACE, though that was not proven to be the only cause. |
| Free Trial pending | Read the billing message. Activation can place a small authorization hold on the card, which is released later. A prepayment request is a separate account requirement. Do not pay again before you know the result of the first payment, and do not keep signing up with other accounts or cards. Follow the instructor's access plan or contact Google Cloud Billing support. |
| Health passes but readiness fails | Check database connectivity, the secret mapping, and the migration logs. Do not copy secret values. |
| The migration job fails | Check the job execution and its logs. The script stops with an error before it deploys the service. |
| The deploy is refused | Read the IAM, quota, or organization policy error first. Do not add broad permissions to experiment. |
| End-to-end login fails | Check the seed mode, the test account, and mustChangePassword. Passwords in the specs do not work in the cloud. |

`deploy/teardown.sh` deletes the database and the other resources. Before you run it, check the project and the list of resources, back up anything you must keep, and confirm the deletion. The script's "Teardown completed" message does not prove everything was deleted, because each command is allowed to fail. Check the remaining resources and billing afterwards.

## 9. Cost estimate

Per project, for the configuration used here: Singapore, zonal `db-f1-micro` with a 10 GiB SSD, and Cloud Run with 1 CPU and 512 MiB billed per request, with light classroom use. Prices were checked on 21 October 2026. This is an estimate, not a bill.

From https://cloud.google.com/sql/pricing with Singapore (asia-southeast1) selected:

- db-f1-micro: USD 0.0147 per hour × 730 = USD 10.731 per month
- SSD: USD 0.000326027 per GiB-hour × 10 × 730 = USD 2.380 per month
- Cloud SQL compute and disk together: USD 13.111 per month, before backups and network
- Backups: USD 0.000153425 per GiB-hour, charged on the size actually stored. An average of 1 to 10 GiB of backups adds about USD 0.112 to 1.120 per month.
- Cloud Run and Cloud Build may fall within the free tier with light use if the billing account's free quota is not used up. That is not guaranteed for every project.
- Secret Manager: 3 versions fit within the free 6 versions per account if no other project uses them. Artifact Registry: 0.5 GiB free per account, then about USD 0.10 per GiB-month.

Light-use budget per project: USD 14 to 18 per month, or about 490 to 630 baht at an assumed 35 baht per USD (not a confirmed exchange rate). This excludes tax, credits, account discounts, and heavy traffic or builds.

| Time Cloud SQL and its 10 GiB SSD exist | USD, SQL compute and disk only | Baht at an assumed 35 per USD |
|---|---:|---:|
| 8 hours | 0.1437 | about 5 |
| 24 hours | 0.4310 | about 15 |
| 7 days | 3.0173 | about 106 |
| 730 hours | 13.1110 | about 459 |

The table does not include backups, Cloud Run, builds, the registry, storage, or network. For a monthly budget, use USD 14 to 18 per set of resources, not per visitor. A team that shares one set of resources shares its database cost, while traffic adds up with use. The short-period figures apply only if you delete the resources afterwards. Closing the browser does not stop Cloud SQL, and a stopped instance can still be charged for storage, backups, and IP addresses.

If a USD 300 Free Trial is active and its credit has not expired, eligible charges come out of the credit first. Check your own balance and expiry date. The TA team's account status says nothing about yours.

Other pricing pages: https://cloud.google.com/run/pricing ; https://cloud.google.com/build/pricing ; https://cloud.google.com/artifact-registry/pricing ; https://cloud.google.com/secret-manager/pricing

When the lab or the course ends:

1. Check your own project ID and save the data and evidence you need for your submission.
2. Read the list of resources to be deleted and confirm before you run teardown, because the database is deleted too.
3. Check what is left, especially Cloud SQL, retained backups, images in Artifact Registry, and Cloud Build buckets.
4. Check billing after it updates. An alerts-only budget does not stop spending.
