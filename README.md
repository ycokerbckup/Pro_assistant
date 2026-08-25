# Scripture & Lyrics Assistant — Harvesters Lekki

Standalone project. Not part of HLDT-App — separate repo, separate Supabase project, no shared auth.

## What's here (Phase 1)

- `src/lib/scriptureParser.js` — deterministic reference parser (tested against
  synthetic spoken forms; still needs a pass against a real transcript).
- `src/hooks/useAudioCapture.js` — device picker + capture, with distinct
  constraint profiles for board/line feed vs device mic.
- `src/lib/supabaseClient.js` — lazy client, not wired into the UI yet.
- `src/App.jsx` — a smoke test, not the operator UI: manual reference search
  (proves the parser) + an audio source panel (proves capture). No
  transcription, no live suggestions, no Supabase writes yet.
- `schema.sql` (repo root, one level up from here in the files you already
  have) — run this against your new Supabase project once it exists.

## Setup

```bash
npm install
cp .env.example .env   # fill in from Supabase → Settings → API
npm run dev
```

The app runs and the manual search panel works with **no Supabase config at
all** — verse lookups hit bible-api.com directly. You only need `.env` filled
in once the next phase starts writing to `live_suggestions`.

## Known gaps, not hidden

- Verse lookup (`bible-api.com`) was never actually tested end to end — this
  sandbox's network access doesn't reach that domain, only vite build/lint
  were verified. Confirm it works the first time you run it locally.
- Reference parser was tested against sentences I wrote, not a real sermon
  transcript. Treat the confidence tiers as a starting point, not tuned.
- No STT integration, no `live_suggestions` writes, no confirm-queue UI yet.
  That's next.

## Not yet decided

- Translation source: assuming public-domain (KJV via bible-api.com) unless
  told the service reads from a copyrighted translation (NIV/AMP/etc.),
  which needs API.Bible instead.
