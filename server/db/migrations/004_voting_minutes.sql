CREATE TABLE IF NOT EXISTS polls (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 created_by TEXT NOT NULL REFERENCES users(id), question TEXT NOT NULL,
 ballot_type TEXT NOT NULL CHECK(ballot_type IN ('public','secret')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
 results_published INTEGER NOT NULL DEFAULT 0 CHECK(results_published IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS poll_options (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 label TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public_votes (
 poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), option_id TEXT NOT NULL REFERENCES poll_options(id),
 cast_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(poll_id,user_id)
);
CREATE TABLE IF NOT EXISTS secret_vote_ledger (
 poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(poll_id,user_id)
);
CREATE TABLE IF NOT EXISTS secret_ballots (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 option_id TEXT NOT NULL REFERENCES poll_options(id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_secret_ballots_poll ON secret_ballots(poll_id);
CREATE TABLE IF NOT EXISTS meeting_minutes (
 meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '', updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS speech_history (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), invited_by TEXT NOT NULL REFERENCES users(id),
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at TEXT, duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_speech_history_meeting ON speech_history(meeting_id,started_at,id);
INSERT OR IGNORE INTO meeting_minutes(meeting_id) SELECT id FROM meetings;
INSERT OR IGNORE INTO schema_migrations(version) VALUES (4);
