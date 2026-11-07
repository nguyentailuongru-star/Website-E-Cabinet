CREATE TABLE IF NOT EXISTS meetings (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT,
 location TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','ended')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS meeting_participants (
 meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), meeting_role TEXT NOT NULL CHECK(meeting_role IN ('chair','secretary','delegate','screen')),
 PRIMARY KEY(meeting_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_one_chair ON meeting_participants(meeting_id) WHERE meeting_role='chair';
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_one_secretary ON meeting_participants(meeting_id) WHERE meeting_role='secretary';
CREATE TABLE IF NOT EXISTS agenda_items (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attendance (
 meeting_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'absent' CHECK(status IN ('present','absent_excused','absent')),
 joined_at TEXT, updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(meeting_id,user_id),
 FOREIGN KEY(meeting_id,user_id) REFERENCES meeting_participants(meeting_id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 agenda_item_id TEXT REFERENCES agenda_items(id) ON DELETE SET NULL, title TEXT NOT NULL,
 original_path TEXT NOT NULL, original_name TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification IN ('ordinary','restricted')),
 audience TEXT NOT NULL CHECK(audience IN ('all','selected')), page_count INTEGER NOT NULL,
 revoked_at TEXT, uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS document_access (
 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(document_id,user_id)
);
CREATE TABLE IF NOT EXISTS document_pages (
 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, page_number INTEGER NOT NULL,
 image_path TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 PRIMARY KEY(document_id,page_number)
);
CREATE TABLE IF NOT EXISTS personal_notes (
 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
 page_number INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(document_id,user_id,page_number),
 FOREIGN KEY(document_id,page_number) REFERENCES document_pages(document_id,page_number) ON DELETE CASCADE
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (2);
