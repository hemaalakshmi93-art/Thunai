# Deploying Thunai to Google Cloud Run

## 0. Push to GitHub (public repo — required by the challenge)
```bash
cd thunai
git init && git add . && git commit -m "Thunai: elderly care & medication platform"
git branch -M main
git remote add origin https://github.com/<your-username>/thunai.git
git push -u origin main
```
Then GitHub → Settings → make sure the repo is **Public**.

## 1. One-time Google Cloud setup
1. Create/choose a project at console.cloud.google.com and **enable billing** (free tier is plenty).
2. Install the `gcloud` CLI (or use **Cloud Shell**, which has it already) and run `gcloud auth login`.
3. Get a Gemini API key at https://aistudio.google.com/apikey (optional but recommended).
4. For real emails: Google Account → Security → 2-Step Verification → **App passwords** → create one.

## 2. Deploy (one command)
```bash
export PROJECT_ID=your-project-id
export GEMINI_API_KEY=your-gemini-key
export SMTP_HOST=smtp.gmail.com SMTP_USER=you@gmail.com SMTP_PASS=your-app-password
export MAIL_FROM="Thunai Care <you@gmail.com>"
./scripts/deploy.sh
```
The script enables the APIs, creates Firestore, deploys to Cloud Run (Mumbai), sets `APP_URL`, and creates a **Cloud Scheduler** job that calls `/api/cron/tick` every 5 minutes. The printed URL is your **Deployed Project link** for the submission.

> Tip: for production put secrets in **Secret Manager** (`--set-secrets`) instead of env vars.

## 3. Verify
- Open the URL → *Start a new circle* → save the passcodes.
- Add a medicine with Smart Add, then **Circle → Send test reminder**.
- `curl <URL>/api/healthz` → `{"ok":true,"gemini":true,"store":"firestore",...}`
- **Judges' check:** the Top 10 are disqualified if the Cloud Run link is down — open it right before the deadline.

## Manual alternative
```bash
gcloud run deploy thunai --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,SESSION_SECRET=$(openssl rand -hex 32),CRON_SECRET=<secret>
```

## Submission checklist
- [ ] GitHub repo public · [ ] Cloud Run URL works · [ ] Short description (copy the table in README) · [ ] Test run done (you only get 2 scored submissions)
