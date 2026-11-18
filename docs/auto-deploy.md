# Auto Deploy and Rollback for TokTickIT

## Overview

The pipeline uses two GitHub Actions workflows and the GCP resources you created with `deploy/deploy.sh`:

1. Open a Pull Request. In your team, feature work goes into your staging branch first and a release Pull Request takes it into `main` (Student Guide 0.1), so CI must run on Pull Requests into both. `ci-docker.yml` tests the backend, the frontend, and the deploy scripts, and builds the Docker image.
2. Merge into `main`. `deploy.yml` runs CI again, builds and pushes the image tagged with the commit SHA, runs the migration job, updates Cloud Run, and runs the smoke test.
3. To roll back: Actions > Deploy demo > Run workflow on `main`, and enter the SHA of an earlier successful run in `image_tag`. The workflow checks the image, deploys it, and runs the smoke test. It skips the tests, the build, and the migration.

An empty `image_tag` means "test and build the current `main`", not a rollback. A rollback needs the full 40-character SHA. The image is resolved to its digest before use, so the migration job and the website run exactly the same image.

## One-time setup

Do the first deploy with `deploy/deploy.sh`. It creates the database, secrets, migration job, and website. The CD pipeline never runs this provisioning script again, and it has no permission to manage IAM or create databases.

The TA rehearsal used project `YOUR_PROJECT_ID`, region `asia-southeast1`, service `toktickit`, job `toktickit-migrate`, and a GitHub environment named `demo`. Use your own project and account.

Create the GitHub environment `demo`, allow only the `main` branch to deploy to it, and add these variables:

| Variable | Value in the TA rehearsal |
|---|---|
| `GCP_PROJECT_ID` | `YOUR_PROJECT_ID` |
| `GCP_REGION` | `asia-southeast1` |
| `WIF_PROVIDER` | `projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| `WIF_SERVICE_ACCOUNT` | `toktickit-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com` |

Enable the IAM Service Account Credentials API and the Security Token Service API, then set up Workload Identity Federation following [Google's guide](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account). Do not download a service account key.

Before you write the subject condition, check the OIDC subject format of your own repository:

```bash
gh api repos/OWNER/REPO/actions/oidc/customization/sub
```

In the TA rehearsal, `use_immutable_subject=true`, and `sub_claim_prefix` was `repo:YOUR_OWNER@OWNER_ID/YOUR_REPO@REPO_ID`. The subject condition must add `:environment:demo` to the end. With the older format that has no IDs, authentication fails with `The given credential is rejected by the attribute condition`. Read the [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims) and check the real values for your repository. Do not copy another team's IDs.

Permissions used in the rehearsal:

- Deployer service account: `roles/run.developer` on the project
- Deployer service account: `roles/artifactregistry.writer` on the `toktickit` repository only
- Deployer service account: `roles/iam.serviceAccountUser` on the runtime service account `toktickit-runner` only
- Principal from Workload Identity Federation: `roles/iam.workloadIdentityUser` on the deployer service account only
- The provider checks repository ID `REPO_ID`, owner ID `OWNER_ID`, ref `main`, workflow `deploy.yml`, and subject environment `demo`, so it does not accept tokens from Pull Requests or other forks

The image is built on the GitHub runner and pushed straight to Artifact Registry, so CD does not use Cloud Build. The deployer service account never reads Secret Manager. The migration job and the website read their secrets through the runtime service account, as set up by `deploy.sh`.

## Smoke test

`python3 deploy/smoke_test.py SERVICE_URL` checks `/api/health`, `/api/ready` (database connected), the HTML at `/`, and the data from `/api/categories`. All checks must pass.

The readiness check expects `/api/ready` to return HTTP 200 with `"db": "connected"` in the JSON body. A response with only `{ "status": "ready" }` fails it. Add that field to your endpoint, or change the check in `smoke_test.py` to match what your app returns. A 200 status alone does not prove the database is reachable.

Sign-in is optional. Set the environment variable `SMOKE_EMAIL` and the environment secret `SMOKE_PASSWORD` for a dedicated test account, and the script checks login, me, and logout. Without them it prints `SKIP login`. Never put the administrator password in a workflow or a guide. A passing smoke test does not mean the business flows pass end to end.

## Merge gate

Settings > Rules > Rulesets > branch `main`: turn on Require a pull request and Require status checks to pass, then select the real check name `test-and-docker`. Turn on Require branches to be up to date before merging, and leave the bypass list empty.

Use a normal Pull Request, not a draft, to prove that a failing test blocks the merge. A draft Pull Request cannot be merged anyway, so it proves nothing. Check the required check and the merge status on the Pull Request itself, not only the ruleset switches.

## Rollback

1. Open the last successful run and copy the commit image tag from its Summary.
2. Actions > Deploy demo > Run workflow, select `main`, and enter that tag in `image_tag`.
3. Check that the test and build steps were skipped, the image check and the deploy passed, and the smoke test passed.
4. In Cloud Run, check that traffic goes to the new revision, which uses the digest of the older image.
5. To restore the newer release, run the workflow again with the full SHA of that release. This reuses the image you already checked. An empty `image_tag` would test, rebuild, and deploy the current `main` instead, which gives you a new image rather than the one you tested.

A rollback changes only the application image. It does not roll back the database. It works only when the schema is still compatible with the older image, so add new schema first and remove old parts later (expand, then contract). If a migration dropped or renamed a column, plan for the data separately before you roll back.

The workflow does not roll back on its own when the smoke test fails, because it cannot know whether the schema is compatible. Read the run and its logs, then choose a version you have checked. Deploys are queued and never cancelled in the middle of a migration.

## What the TA rehearsal verified

Checked on 21 October 2026 (Asia/Bangkok):

| Item | Result |
|---|---|
| Offline tests for provisioning, release, and smoke test | Passed. A failed migration must not update the website, and a rollback must not run a migration. |
| CI on a Pull Request | Passed before the merge. |
| Merge gate | A normal Pull Request into `main` with a failing test showed the Required label, a blocked merge state, and a disabled Merge button. It was closed without merging. |
| Auto deploy after merge | Passed CI, Workload Identity Federation, build and push, migration, and the smoke test. |
| Rollback | Deployed an earlier image by its SHA. Tests and build were skipped, and the smoke test passed. |
| Read-back after rollback | The serving revision had 100% of traffic and used the digest of the image deployed first. |
| Sign-in after auto deploy | Checked separately from the workflow: login, me, and logout passed. The administrator password was not stored in GitHub. |

The team also checked tickets, roles, actions, dashboards, and the persistence of sessions and attachments on the live service, and fixed two UI regressions it found there. A rollback across a destructive schema migration was not tested. The failing-test Pull Request was used only to prove the merge gate. No broken code was merged into `main` to test the deploy.
