# Check new activities (hourly)

The **Check new activities** workflow runs every hour and emails you when a new **Sunday Americano** or **Lunchtime Masterclass** (Ilford) is published.

## Required secrets

In the repo: **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|--------|-------------|
| `EMAIL_TO` | Email address to receive notifications |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | SMTP login (e.g. your Gmail) |
| `SMTP_PASS` | SMTP password (e.g. Gmail App Password) |

Optional: `EMAIL_FROM`, `SMTP_SECURE` (`true`/`false`), `PADELMATES_AUTH_TOKEN` (for same API data as when logged in).

## Manual run

**Actions → Check new activities → Run workflow.**

## State

The workflow caches the `.activity-state/` directory (known activity IDs) between runs so only **new** activities trigger an email. First run does not send emails (it only fills the cache).
