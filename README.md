# Smart Trainer

A personal-trainer web app for your phone. It reads your **Strava** training and your **WHOOP** recovery, sleep and strain, and uses **Claude** as your coach.

- **Daily message:** when WHOOP scores your morning recovery, the app syncs your data, has the coach pick today's training mode (rest, recovery, easy or long endurance, tempo, threshold, VO₂max, strength, mobility) and sends it as a push notification and/or Telegram message. A daily cron job is the fallback.
- **Coach chat:** a Claude-style chat screen that can see your latest data. Ask things like "plan my week", "I only have 30 minutes" or "am I overreaching?".
- **Automatic data upload:** Strava and WHOOP webhooks push new activities, sleep, recovery and workouts as they happen, and a daily sync acts as a safety net.
- **Today dashboard:** recovery, HRV, sleep, today's plan, training load (fitness, fatigue and form) and recent sessions.

The stack is Next.js (App Router) as an installable PWA, Postgres, the Anthropic SDK (`claude-opus-5-5`) and Web Push. It is built to deploy on Vercel.

## How it works

```
Strava webhook ──► /api/strava/webhook ──► fetch activity ──► Postgres
WHOOP webhook  ──► /api/whoop/webhook  ──► re-sync 2 days ──► Postgres
                                   └─ recovery.updated (first today) ─► daily run
Vercel Cron 07:00 UTC ──► /api/cron/daily ──► daily run (skipped if a plan already exists)

daily run = sync ─► build athlete snapshot ─► Claude (structured plan) ─► Web Push + Telegram
chat      = snapshot + today's plan + history ─► Claude (streamed reply)
```

**Training load:** each session gets one load number. It uses Strava Relative Effort where available. Otherwise it estimates load from WHOOP strain, and as a last resort from duration. Fitness is the 42-day average of daily load, fatigue is the 7-day average, and form is fitness minus fatigue. When Strava and WHOOP record the same session (starts within 20 minutes of each other), the two are merged. The coach is told these numbers are estimates, not measurements.

## Setup

### 1. Database
Create a free Postgres database (for example Neon, Supabase or Vercel Postgres) and apply the schema:

```bash
npm install
DATABASE_URL=postgres://... npm run db:migrate
```

### 2. Deploy
Push this repository to Vercel, or run `vercel`. Then set the environment variables listed in [`.env.example`](.env.example). The minimum you need:

| Variable | Where it comes from |
|---|---|
| `APP_URL` | Your deployment URL, e.g. `https://smart-trainer.vercel.app` |
| `APP_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET` | Pick them yourself. Use long random strings for the secrets. |
| `TZ_NAME` | Your time zone, e.g. `Europe/Berlin` |
| `DATABASE_URL` | Step 1 |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `STRAVA_*` | Step 3 |
| `WHOOP_*` | Step 4 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Run `npm run vapid` |

### 3. Strava
1. Create an API application at https://www.strava.com/settings/api.
2. Set **Authorization Callback Domain** to your deployment's domain, without `https://`.
3. Copy the Client ID and Client Secret into `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`. Set `STRAVA_WEBHOOK_VERIFY_TOKEN` to any random string.
4. In the app, open **Settings → Connect Strava**, then tap **Enable Strava auto-upload**. This registers the webhook. Strava allows one webhook per app.

### 4. WHOOP
1. Create an app at https://developer-dashboard.whoop.com.
2. Add the redirect URL `https://<your-domain>/api/whoop/callback`.
3. Select the scopes `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement` and `offline`.
4. Set the **webhook URL** to `https://<your-domain>/api/whoop/webhook` and choose model version **v2**.
5. Copy the Client ID and Client Secret into `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET`. The client secret is also used to verify webhook signatures.
6. In the app, open **Settings → Connect WHOOP**.

### 5. Your phone
1. Open your deployment URL on your phone and sign in with `APP_PASSWORD`.
2. Install the app:
   - **iPhone:** in Safari, tap Share → **Add to Home Screen**. Web push on iOS only works from the installed app (iOS 16.4 or later).
   - **Android:** in Chrome, tap ⋮ → **Install app**.
3. Open the installed app, go to **Settings → Enable notifications** and send a test.
4. Fill in your **athlete profile** (goals, sports, available hours, injuries). The coach uses it alongside your data.

### Optional: Telegram as a second channel
Create a bot with [@BotFather](https://t.me/BotFather) and send it a message. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat ID. Then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Each daily plan is then also sent there as a full message.

### Timing of the daily message
The plan is sent once per day, triggered by whichever comes first:
- WHOOP's first `recovery.updated` webhook of the day, which arrives shortly after you wake up.
- The cron job in [`vercel.json`](vercel.json), which defaults to `0 7 * * *` UTC (09:00 Berlin summer time, 08:00 winter time). Change it to suit you.

You can also tap **Regenerate** on the Today screen at any time.

## Local development

```bash
cp .env.example .env.local   # fill in values; APP_URL=http://localhost:3000
npm run db:migrate
npm run dev
```

The OAuth callbacks and webhooks need a public HTTPS URL. For local testing, use a tunnel such as `cloudflared` or `ngrok`, set `APP_URL` to the tunnel URL, and register that URL with Strava and WHOOP.

## Notes
- This is a single-user app, protected by one password. Your tokens and data live in your own database.
- Claude calls use adaptive thinking and server-side refusal fallback (`fallbacks: "default"`). Set `CLAUDE_MODEL` to use a different model.
- The coach is not a doctor. If your data or your messages suggest illness or injury, it recommends rest and seeing a professional.
