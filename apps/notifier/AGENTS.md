# notifier agent instructions (`apps/notifier`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `apps/notifier/src/` unless they start with `apps/` or `packages/`.

## Layout

- Stream alerts (YouTube, Twitch, Chzzk) are sent to Discord webhooks. `services/` holds one module per source: `youtubeWebSub.ts` / `youtubeScheduler.ts`, `twitchApi.ts` / `twitchScheduler.ts`, `chzzkApi.ts` / `chzzkPoller.ts`. Shared loop: `pollingLoop.ts`. Delivery: `dispatcher.ts`.
- `routes/pubsub.ts` (YouTube WebSub) and `routes/eventsub.ts` (Twitch EventSub) are the only unauthenticated routes besides health. Both verify the callback HMAC before trusting a body.
- `services/webhookHub.ts` is a Redis request/reply hub: webhook creation needs the bot token, so the bot owning the guild creates the webhook.

## Env and secrets

- Env schema: `config/env.ts`. The auth key is `NOTIFIER_AUTH_KEY ?? AUTH_KEY`. Startup fails closed without one (`config/env.test.ts`).
- Webhook tokens are encrypted at rest (`services/secretStorage.ts`) with `DATA_ENCRYPTION_KEY`, which is derived from `AUTH_KEY` when unset. **When rotating `AUTH_KEY`, put the old value in `DATA_ENCRYPTION_KEY`**, or existing rows can't be decrypted.
- Push delivery is opt-in per source. WebSub needs `NOTIFIER_PUBLIC_URL` + `YOUTUBE_HUB_SECRET` (otherwise RSS polling only). EventSub needs the Twitch client ID/secret, the public URL and `TWITCH_EVENTSUB_SECRET` (20–100 chars). `CHZZK_POLLING_ENABLED` turns off only on the exact string `'false'`, so don't switch it to `z.coerce.boolean()`.
