-- Scripture + Lyrics Assistant — Phase 1 schema
--
-- Standalone project, single operator, no login. Nothing here references
-- a user/profiles table — there's no principal to attach one to.

-- ─────────────────────────────────────────────────────────────────────────
-- Scripture: cache only. Verse TEXT is never hand-entered or AI-generated
-- here — it's fetched from a licensed source (default assumption: bible-api.com
-- for public-domain translations; swap to API.Bible if the service reads
-- from NIV/AMP/NKJV, which are copyrighted) and cached so a live lookup
-- during service never blocks on an external API call.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists bible_translations (
  code text primary key,           -- e.g. 'kjv', 'web'
  name text not null,
  is_public_domain boolean not null default false,
  source text not null,            -- API/provider this was fetched from
  license_note text
);

create table if not exists verse_cache (
  id uuid primary key default gen_random_uuid(),
  translation_code text not null references bible_translations(code),
  book text not null,
  chapter int not null,
  verse int not null,
  text text not null,
  fetched_at timestamptz not null default now(),
  unique (translation_code, book, chapter, verse)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Lyrics: structure only. Actual line text must come from your licensed
-- CCLI SongSelect export or equivalent — this schema doesn't generate or
-- assume lyric content, it just gives it somewhere to live once you have
-- rights-cleared text to put there.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  ccli_number text,
  created_at timestamptz not null default now()
);

create table if not exists song_lines (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  section text not null,           -- 'verse_1' | 'chorus' | 'bridge' | etc.
  line_number int not null,
  text text not null
);

create index if not exists song_lines_song_id_idx on song_lines(song_id);
-- Trigram index for fuzzy line matching against transcript fragments —
-- requires the pg_trgm extension.
create extension if not exists pg_trgm;
create index if not exists song_lines_text_trgm_idx on song_lines using gin (text gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────
-- Live capture sessions + the suggest-then-confirm queue.
-- Nothing in `live_suggestions` should reach a display screen without a
-- status of 'confirmed' — that transition happens from the operator UI,
-- not automatically, regardless of confidence score.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  audio_source_type text not null check (audio_source_type in ('mic', 'line'))
);

create table if not exists live_suggestions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  type text not null check (type in ('scripture', 'lyric')),
  transcript_snippet text not null,

  -- populated when type = 'scripture'
  matched_book text,
  matched_chapter int,
  matched_verse_start int,
  matched_verse_end int,

  -- populated when type = 'lyric'
  matched_song_line_id uuid references song_lines(id),

  confidence numeric not null,     -- 0-1, from the parser/matcher
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists live_suggestions_session_status_idx
  on live_suggestions(session_id, status);

-- RLS: not enabled. Single operator, no login — there's no principal to
-- write a policy against. Revisit only if that changes.
