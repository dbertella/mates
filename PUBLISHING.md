# Publishing the app

## 1. Push to GitHub (if you haven’t)

```bash
git remote add origin https://github.com/YOUR_USERNAME/mates.git   # or your repo URL
git push -u origin main
```

- Add **Actions secrets** (Settings → Secrets and variables → Actions) so the hourly workflow can send email: `EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.

## 2. Install dependencies (including electron-builder)

```bash
yarn install
```

## 3. Build the app

- **Current platform only** (faster):
  ```bash
  yarn build
  ```
- **macOS** (DMG + ZIP): `yarn build:mac`
- **Windows** (installer + portable): `yarn build:win`
- **Both**: `yarn build:all`

Output goes to the **`dist/`** folder (e.g. `dist/Club Activities-1.0.0.dmg` on macOS).

## 4. Publish / distribute

**Option A – Share the build yourself**  
Copy the `.dmg` (macOS) or `.exe` / installer from `dist/` and share via link or USB.

**Option B – GitHub Releases**  
1. Create a new release: Repo → **Releases** → **Draft a new release**.
2. Tag version (e.g. `v1.0.0`), add release notes.
3. Upload the files from `dist/` (e.g. `Club Activities-1.0.0.dmg`, `Club Activities Setup 1.0.0.exe`).
4. Publish the release.

**Option C – Auto-publish from CI**  
You can add a workflow that runs `yarn build` and uploads `dist/` artifacts or publishes to GitHub Releases on tag push (e.g. when you push `v1.0.0`). Say if you want this and we can add it.

## Note

The app reads email config from a **`.env`** file in the same folder as the app. For a built app, put `.env` next to the executable (or in the app’s user data directory) so the user can have their own SMTP settings. If you prefer, we can switch to a different config location for the packaged app.
