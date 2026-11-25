-- Run in skm_site after the site creates the delivery columns.
-- The systemd unit connects over a Unix socket using peer authentication.
CREATE ROLE skm_site_mail LOGIN CONNECTION LIMIT 2;
GRANT CONNECT ON DATABASE skm_site TO skm_site_mail;
GRANT USAGE ON SCHEMA public TO skm_site_mail;
GRANT SELECT (id, name, phone, email, comment, mail_next_attempt_at, mail_sent_at),
      UPDATE (mail_next_attempt_at, mail_sent_at)
ON public.contact_requests TO skm_site_mail;
