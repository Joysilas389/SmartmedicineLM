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

## 6. Updating later

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
