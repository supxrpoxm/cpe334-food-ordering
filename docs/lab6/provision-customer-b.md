# Provision Customer B for Lab 6 UAT

This procedure creates one synthetic CUSTOMER account in the existing Food Ordering Cloud SQL database. It does not alter Customer A or Admin. The updated release creates the account through the existing migration/seed Cloud Run job; the job uses a distinct Secret Manager value for Customer B.

## 1. Create the password secret

Run this in Google Cloud Shell while signed in to project `cpe334-th-048-p4`. It creates a new random password, stores it in Secret Manager without putting the value in shell history, prints it once for the authorized Product Team handoff, and clears the shell variable.

```sh
set -euo pipefail
PROJECT_ID=cpe334-th-048-p4
SECRET=food-ordering-demo-user-b-password

if gcloud secrets describe "$SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Secret already exists; stop and confirm its value/version before proceeding." >&2
  exit 1
fi

CUSTOMER_B_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)Bb7!"
printf '%s' "$CUSTOMER_B_PASSWORD" | gcloud secrets create "$SECRET" \
  --replication-policy=automatic --data-file=- --project="$PROJECT_ID"
printf 'Customer B password (send only via the agreed private handoff): %s\n' "$CUSTOMER_B_PASSWORD"
unset CUSTOMER_B_PASSWORD
```

Copy the printed value to the approved private course handoff. Do not put it in GitHub, an issue, this repository, screenshots, or ordinary deployment logs.

## 2. Allow only the migration job service account to read it

```sh
gcloud secrets add-iam-policy-binding food-ordering-demo-user-b-password \
  --member='serviceAccount:food-ordering-runner@cpe334-th-048-p4.iam.gserviceaccount.com' \
  --role='roles/secretmanager.secretAccessor' \
  --project=cpe334-th-048-p4 --quiet
```

## 3. Deploy the updated seed and verify completion

After the code change is merged to `main`, the `Deploy demo` workflow updates the existing `food-ordering-migrate` job with the new secret mapping, runs migrations and seed, then deploys the service. Do not merge before steps 1 and 2 are complete. The migration/seed job logs should report three accounts ensured. Then check the active Cloud Run revision, traffic allocation, and image digest, and have the Product Team privately verify that `customer-b@example.com` can sign in before handing credentials to the UAT Team.

If deployment or seeding fails, do not claim Customer B is provisioned. Resolve the job error, then rerun the release workflow against the same intended commit.
