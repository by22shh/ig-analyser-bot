const appArg = process.argv.slice(2).find((arg) => arg !== "--" && arg.trim());
const app = process.env.FLY_APP || appArg || "ig-analyser-bot";
const runDate = process.env.EVAL_RUN_DATE || new Date().toISOString().slice(0, 10);
const outDir =
  process.env.EVAL_OUT_DIR ||
  `docs/research/${runDate}-instagram-profile-eval-fly-live-${app.replace(/[^a-z0-9-]/gi, "-")}`;

console.log(`# Fly live eval checklist

Production quality claims require a deployed Fly revision and live eval artifacts from that revision.
Do not use local-only \`pnpm eval-golden\` output as proof that Fly production is equivalent.

1. Verify local gates:
   pnpm run ci

2. Deploy the exact revision:
   fly deploy --remote-only --app ${app}

3. Confirm the deployed app is healthy:
   fly status --app ${app}
   curl https://${app}.fly.dev/health
   fly logs --app ${app}

4. Run the golden public-profile eval against the deployed Fly/runtime environment and save artifacts:
   EVAL_PROFILE_PROVIDER=apify EVAL_OUT_DIR=${outDir} pnpm tsx scripts/eval-public-instagram-profiles.ts

   If the eval is executed from a Fly console or one-off machine, keep secrets inside Fly,
   copy back only public profile/report artifacts, and never paste provider tokens into logs.

5. Validate the saved artifacts:
   pnpm eval-golden ${outDir}

6. Only after step 5 passes may release notes, docs, sales copy or admin dashboards claim
   production/Fly report quality for this revision.
`);
