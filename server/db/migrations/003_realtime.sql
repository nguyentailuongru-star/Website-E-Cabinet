CREATE TABLE IF NOT EXISTS meeting_state (
 meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
 document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
 page_number INTEGER NOT NULL DEFAULT 1 CHECK(page_number>=1),
 speaking_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 speaker_started_at TEXT, speaker_duration_seconds INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS speech_requests (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(meeting_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_speech_queue ON speech_requests(meeting_id,requested_at,id);
INSERT OR IGNORE INTO meeting_state(meeting_id) SELECT id FROM meetings;
INSERT OR IGNORE INTO schema_migrations(version) VALUES (3);
