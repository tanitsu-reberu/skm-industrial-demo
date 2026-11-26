-- Apply after migration 001, before upgrading Python. Existing mailer remains
-- compatible.
-- Run as the database owner / role administrator, in skm_site.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skm_site_mail') THEN
        CREATE ROLE skm_site_mail LOGIN CONNECTION LIMIT 2;
    END IF;
END
$$;
GRANT CONNECT ON DATABASE skm_site TO skm_site_mail;
GRANT USAGE ON SCHEMA public TO skm_site_mail;
GRANT SELECT (
    id, name, phone, email, comment, mail_next_attempt_at, mail_sent_at,
    mail_attempts, mail_status, mail_last_error
), UPDATE (
    mail_next_attempt_at,
    mail_sent_at,
    mail_attempts,
    mail_status,
    mail_last_error
) ON public.contact_requests TO skm_site_mail;
