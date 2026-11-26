-- Requires independent evidence that historical naive timestamps were written
-- as UTC.
-- The runner refuses a naive source unless --source-utc-verified is
-- explicitly supplied.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_privacy_consents'
            AND column_name = 'received_at' AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE admin_privacy_consents
            ALTER COLUMN received_at TYPE TIMESTAMPTZ
            USING received_at AT TIME ZONE 'UTC';
    END IF;
END
$$;
