# Deploying from a phone (Termux → GitHub → Vercel)

## 1. Prepare Termux (first time only)

```bash
pkg update -y && pkg upgrade -y
pkg install -y git unzip
termux-setup-storage          # tap "Allow" so Termux can see Downloads
git config --global user.name "Joysilas389"
git config --global user.email "joysilas389@gmail.com"
```

## 2. Unzip the project

```bash
cd ~
unzip -o ~/storage/downloads/smartmedicinelm.zip
cd SmartMedicineLM
ls                            # you should see api, ai, frontend, README.md …
```

## 3. Push to GitHub

GitHub no longer accepts your account password for `git push`. Create a **Personal Access Token**:
GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token → tick **repo** → copy the token (starts with `ghp_`).

```bash
git init
git branch -M main
git add .
git commit -m "SmartMedicineLM Phase 1"
git remote add origin https://github.com/Joysilas389/SmartmedicineLM.git
git push -u origin main
```

When asked: **Username** = `Joysilas389`, **Password** = paste the token.

If the repository already has commits (for example a README created on GitHub) and the push is rejected:

```bash
git pull origin main --allow-unrelated-histories --no-edit
git push -u origin main
```

(or, to replace everything on GitHub with this version: `git push -u origin main --force`).

To stop re-typing the token: `git config --global credential.helper store` (it is then saved in plain text on the phone).

## 4. Deploy on Vercel

1. Open vercel.com in the browser, sign in with GitHub.
2. **Add New… → Project** → pick **SmartmedicineLM** → **Import**.
3. Leave Framework Preset as **Other**; everything else is read from `vercel.json`. Tap **Deploy**.
4. When it finishes, open the URL. The sidebar shows **Demo mode (no API key)**, which means the deployment works.

## 5. Connect a model

Vercel → your project → **Settings → Environment Variables**:

- `ANTHROPIC_API_KEY` = your key from console.anthropic.com
- optional `APP_ACCESS_CODE` = any password (then enter it in the app's Settings page)

Then **Deployments → ⋯ on the latest → Redeploy**. The sidebar pill turns green with the model name.

## 6. Local mode: keep your data in an Excel file on the phone (free, no database)

In local mode the app runs from your own phone and writes everything to a real Excel workbook in your storage, so clearing Chrome's data cannot erase it. You still need internet for the AI itself.

```bash
pkg install nodejs                 # once
termux-setup-storage               # once: lets Termux see your storage
cd ~/SmartMedicineLM
npm install                        # once (and after each update)
cp .env.example .env
nano .env                          # put your ANTHROPIC_API_KEY here, then Ctrl+O, Enter, Ctrl+X
npm run local
```

Open **http://localhost:3000** in Chrome on the phone. Your data is written to:

```
Internal storage/SmartMedicineLM/SmartMedicineLM.xlsx     ← open this in Excel or Google Sheets
Internal storage/SmartMedicineLM/files/                   ← your original PDFs and images
Internal storage/SmartMedicineLM/backups/                 ← the last 10 hourly copies
```

Saving happens a few seconds after each change. If you ever clear the browser, just open the app again: it reloads everything from the workbook. Keep Termux open while studying (`termux-wake-lock` stops Android pausing it); `Ctrl+C` stops the server.

The server listens only on the phone itself, so nothing on your network can reach your notes.

## 7. Turn on accounts and sync (optional, all from the phone)

Without a database the app is single-user and keeps everything in the browser. With one, learners sign in and their work syncs between phone and computer.

1. In the Vercel app or website open your project → **Storage** → **Create Database** → **Neon (Postgres)** → accept the free plan → **Connect** it to the project (all environments). This adds `DATABASE_URL` automatically.
2. Project → **Settings → Environment Variables**, add:

| Variable | Value | Why |
|---|---|---|
| `AUTH_SECRET` | any long random text (e.g. run `openssl rand -hex 32` in Termux) | signs login cookies |
| `SIGNUP_CODE` | optional, e.g. `ghana-med-2026` | only people with the code can create accounts, protecting your API credit |
| `REQUIRE_LOGIN` | optional, `false` | lets people use the AI without signing in (not recommended) |

3. **Deployments** → latest → **Redeploy**. The tables create themselves on the first request; there is nothing to run.
4. Open the site: you'll see the sign-in screen. Create your account. Anything already on that device is added to it.

What syncs: chats, the text of your documents, flashcards, questions and blocks, progress, the knowledge graph, whiteboards and settings. Original PDF/image files stay on the device you uploaded them from (other devices show the extracted text).

## 8. Updating later

After receiving a new zip, unzip it over the folder and:

```bash
cd ~/SmartMedicineLM
git add .
git commit -m "Update"
git push
```

Vercel redeploys automatically on every push.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `unzip: cannot find` | Check the file name: `ls ~/storage/downloads` |
| `Authentication failed` | Use the token, not your password; make sure it has the **repo** scope |
| Sidebar says **API offline** | You opened `index.html` directly; use the Vercel URL |
| Answers say "access code" | Enter `APP_ACCESS_CODE` in Settings → AI model |
| Model errors 401 | Wrong or expired API key; update it and redeploy |
| "Could not reach the database" on sign-in | The Neon database isn't connected to this project or environment; reconnect it under Storage and redeploy |
| "Please sign in" after connecting a database | Expected: create an account on the sign-in screen |
| Local mode: `npm run local` says "cannot find module" | Run `npm install` in the project folder first |
| Local mode: no `~/storage` folder | Run `termux-setup-storage` and allow the permission, then restart the server |
| Excel restore says "not a SmartMedicineLM workbook" | You picked a different spreadsheet; choose the file named `SmartMedicineLM-….xlsx` |
| Settings says semantic search is "Unavailable" | The browser couldn't download the model (offline or blocked). Word search still works; it retries next time |
