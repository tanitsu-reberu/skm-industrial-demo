-- Ordinary BYTEA rows are included automatically in pg_dump (no filesystem volume).
-- Serialize uploads and service reference changes on this singleton row.
CREATE TABLE service_upload_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1)
);
INSERT INTO service_upload_lock (id) VALUES (1);
CREATE TABLE service_uploads (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
    data BYTEA NOT NULL,
    byte_size INTEGER NOT NULL CHECK (
        byte_size > 0 AND byte_size <= 8388608 AND byte_size = octet_length(data)
    ),
    owner_id BIGINT NOT NULL REFERENCES users (id),
    created_at BIGINT NOT NULL,
    attached_at BIGINT
);
