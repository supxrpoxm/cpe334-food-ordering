# First Practice: Use the CLI, Then Check the Result in the Console

Goal: before you create any real resource, you can say which account you are using, which project you are working in, and what the deploy command is going to create.

Use Google Cloud Shell so that everyone works with the same tools. Keep the Cloud Console open next to it to see the results of each step.

The TA team rehearsed this guide on 21 October 2026 with a test account that already had billing enabled, because the Free Trial on a student account could not be activated in time. In that rehearsal the app was deployed, the public link opened, and health, database, and sign-in checks passed without a Google IAM token or localhost. Automatic deployment is covered in the [Auto Deploy guide](auto-deploy.md).

## 1. Check your account in the Console

Open the Google Cloud Console and check the account picture in the top-right corner. Use the account you are allowed to use for this lab, select your project (`YOUR_PROJECT_ID`, named `YOUR_PROJECT_NAME`), and check that billing is enabled.

Use your own account and your own project. Do not copy the project ID from this guide or from another team.

Check billing and credits in the Console too. Having a project or a billing account does not mean the Free Trial is ready. If the trial is still Pending, you can do the read-only steps and the dry run in Cloud Shell, but do not do step 5.

## 2. Check the account and project with the CLI

Open Cloud Shell with the terminal button in the Console. When the prompt appears, run one command at a time:

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
```

**What it does:** shows the account the CLI is using.

**Check in the Console:** it must match the account in the top-right corner. If it does not, switch to the right account before you continue.

Set your project:

```bash
export PROJECT_ID=YOUR_PROJECT_ID
gcloud config set project "$PROJECT_ID"
gcloud config get-value project
```

**What it does:** sets the default project for the CLI and reads it back. This does not create Cloud Run services or databases.

**Check in the Console:** the project ID must match the project selected in the top bar. Changing the project in the CLI does not always change the project selector in the Console, so check both.

## 3. Get the source code

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
git rev-parse --short HEAD
```

**What it does:** downloads your repository and shows the commit you are using.

**Check on GitHub:** compare the commit with the latest commit on `main`, and write down the commit you used.

If you have cloned the repository before, use the existing folder and check its status before updating. Do not clone over it or reset work you have not saved.

## 4. Read the plan before creating anything

```bash
DRY_RUN=1 PROJECT_ID="$PROJECT_ID" bash deploy/deploy.sh
```

**What it does:** prints every command the script would run, without calling GCP and without creating anything.

Add `--demo` to load sample users. Their password is generated and stored in Secret Manager. Demo accounts are allowed in your project because you will need them for UAT in Lab 6, but the password must never be in code or shown on screen.

**Be able to point out these names in the output:**

| Name | What it is for | Where to check it in the Console after the deploy |
|---|---|---|
| `toktickit` in Artifact Registry | Stores the container image | Artifact Registry > Repositories |
| `toktickit-pg` | PostgreSQL database | SQL > Instances |
| `toktickit-database-url` | Stores the database connection string | Secret Manager |
| `toktickit-migrate` | Runs migrations and the seed | Cloud Run > Jobs |
| `toktickit` in Cloud Run | Runs the website and API | Cloud Run > Services |

After a dry run, none of these exist yet. The "Deployment Completed!" message in a dry run is simulated. It does not prove a deploy worked, and it does not check billing, IAM, or quota.

## 5. Deploy for real after the checks

Do this only when credits or billing are ready, a budget alert is set, and you have checked the region, your permissions, and whether the service may be public, as described in the [full guide](gcp-cicd-guide.md#5-prepare-the-first-deploy). This command creates resources that cost money and opens the website to the internet.

```bash
PROJECT_ID="$PROJECT_ID" bash deploy/deploy.sh
```

Follow the output part by part: database and secrets, image build, migration job, then the website. Then open the Console, check each resource in the table in step 4, and write down what you actually see.

What the TA rehearsal ran into:

- A new project, API, or service account can take a little time before its permissions take effect. If the next command is refused, check IAM and the real resources before adding any permission. In the rehearsal, waiting and running the same command again worked.
- Cloud Build in that project used the Compute Engine default service account to build. The team gave that account the Cloud Build Service Account role in the test project instead of giving Owner to a service account.
- A successful deploy can still print a warning that `allUsers` could not be added. In the rehearsal, the organization blocked `allUsers`, so public access was turned on with the Cloud Run setting in step 6. A command that exits with 0 does not prove the website is public.

If an error appears, stop and read it. Do not run the command again right away, especially for migrations and credentials.

## 6. Check the deployed website

In the TA rehearsal, the service opened directly at a URL like `https://toktickit-xxxxxxxxxx-as.a.run.app`, with no proxy or localhost, but you still sign in to TokTickIT.

If your organization restricts `allUsers`, read the policy first:

```bash
gcloud org-policies describe constraints/run.managed.requireInvokerIam --effective --project="$PROJECT_ID"
```

In the rehearsal the Organization Policy API was enabled to read the policy, and the effective value was `enforce: false`. Public access was then turned on for that one service, following [Google's guidance](https://docs.cloud.google.com/run/docs/authenticating/public):

```bash
gcloud run services update toktickit --no-invoker-iam-check --project="$PROJECT_ID" --region=asia-southeast1
```

In the Console: Cloud Run > toktickit > Security > Allow public access, then save. This lets anyone reach the service endpoint. To close it again, run the same command with `--invoker-iam-check` or untick the setting. Removing `allUsers` from IAM does not close a service that was opened this way. If the policy enforces IAM, ask a TA before you change anything. The rehearsal did not change any organization policy.

Copy the Service URL you got and set it as a variable. Replace the text in quotes with your URL:

```bash
export SERVICE_URL='paste your Service URL here'
curl --fail --show-error "$SERVICE_URL/api/health"
curl --fail --show-error "$SERVICE_URL/api/ready"
```

Open the Service URL in a browser. Open Secret Manager on your own to see the initial administrator password, sign in, change the password, and test the main flow of the app with your team. Never put a password in a guide, a screenshot, or a chat group.

Passing health and readiness checks is not the same as passing an end-to-end test. Record the CLI, Console, and browser results separately.

## What to record

Date and time · who ran it · account and project · commit · commands run · result or error message (without secrets) · resources and revision checked in the Console · browser test result

## Budget and finishing the lab

For the setup used in this rehearsal, budget about USD 14 to 18 per set of resources per month for light use (about 490 to 630 baht at an assumed 35 baht per USD, before tax and credits). The main cost is Cloud SQL, which is billed by the hour even when nobody visits the website. Details, assumptions, and the end-of-lab checklist are in the cost section of the [full guide](gcp-cicd-guide.md#9-cost-estimate).

Closing the browser tab does not stop the cost. Save your work, check the project and the list of resources carefully before you confirm a deletion, and do not run teardown on a project that is still in use.
