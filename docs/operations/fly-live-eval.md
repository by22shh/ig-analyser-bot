# Fly Live Eval Before Quality Claims

Production report-quality claims require a deployed Fly revision plus live eval artifacts from that same revision. Local `pnpm eval-golden` is necessary, but not sufficient, because Fly can differ by image, secrets, provider mode, memory, network and deployed commit.

## Checklist

1. Run local gates:

```bash
pnpm run ci
```

2. Deploy the exact revision:

```bash
fly deploy --remote-only --app ig-analyser-bot
```

3. Confirm runtime health:

```bash
fly status --app ig-analyser-bot
curl https://ig-analyser-bot.fly.dev/health
fly logs --app ig-analyser-bot
```

4. Run the golden public-profile eval against the deployed Fly/runtime environment and save artifacts under `docs/research/<date>-instagram-profile-eval-fly-live-<app>/`.

```bash
EVAL_PROFILE_PROVIDER=apify \
EVAL_OUT_DIR=docs/research/$(date +%F)-instagram-profile-eval-fly-live-ig-analyser-bot \
pnpm tsx scripts/eval-public-instagram-profiles.ts
```

If the eval is executed from a Fly console or one-off machine, keep provider secrets inside Fly and copy back only public profile/report artifacts.

5. Validate the saved artifacts:

```bash
pnpm eval-golden docs/research/<date>-instagram-profile-eval-fly-live-ig-analyser-bot
```

6. Only after step 5 passes may release notes, docs, sales copy or admin dashboards claim production/Fly report quality for the deployed revision.

## Helper

Print the same checklist with an app-specific artifact path:

```bash
pnpm eval:fly-checklist -- ig-analyser-bot
```
