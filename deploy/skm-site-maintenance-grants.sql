-- Owner/operator only. Create matching unprivileged OS user for peer
-- authentication.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'skm_site_maintenance') THEN
        CREATE ROLE skm_site_maintenance LOGIN CONNECTION LIMIT 1;
    END IF;
END
$$;
GRANT CONNECT ON DATABASE skm_site TO skm_site_maintenance;
GRANT USAGE ON SCHEMA public TO skm_site_maintenance;
GRANT SELECT (id, expires_at),
DELETE ON public.otp_codes TO skm_site_maintenance;
GRANT SELECT (token_hash, expires_at),
DELETE ON public.admin_sessions TO skm_site_maintenance;
GRANT SELECT (id, created_at), DELETE, INSERT (event_type, outcome, target_id)
ON public.admin_security_events TO skm_site_maintenance;
GRANT USAGE ON SEQUENCE public.admin_security_events_id_seq
TO skm_site_maintenance;
GRANT SELECT (email, attempt_window),
DELETE ON public.admin_totp_state TO skm_site_maintenance;
GRANT SELECT (id, diagnostic_at),
UPDATE (diagnostic_ip_hash, diagnostic_agent, diagnostic_at)
ON public.contact_requests TO skm_site_maintenance;
