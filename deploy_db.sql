-- Fix permissions
GRANT USAGE ON SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;

-- Schema migrations for Beauty Books World customization
ALTER TABLE IF EXISTS beauty_books_world_customization.orders 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS beauty_books_world_customization.products 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Add triggers on global auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_beauty_books_world_customization ON auth.users;
CREATE TRIGGER on_auth_user_created_beauty_books_world_customization
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION beauty_books_world_customization.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_role_created_beauty_books_world_customization ON auth.users;
CREATE TRIGGER on_auth_user_role_created_beauty_books_world_customization
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION beauty_books_world_customization.handle_new_user_role();

DROP TRIGGER IF EXISTS on_auth_user_settings_created_beauty_books_world_customization ON auth.users;
CREATE TRIGGER on_auth_user_settings_created_beauty_books_world_customization
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION beauty_books_world_customization.handle_new_user_settings();

-- Generate the superadmin user
DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
  -- Delete the user if it was partially created earlier
  DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'superadmin-beauty-books-world@buildstart.io');
  DELETE FROM auth.users WHERE email = 'superadmin-beauty-books-world@buildstart.io';
  DELETE FROM beauty_books_world_customization.staff_accounts WHERE staff_email = 'superadmin-beauty-books-world@buildstart.io';

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', 'superadmin-beauty-books-world@buildstart.io',
    crypt('GP&4$xtzd53g#J', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text, format('{"sub":"%s","email":"%s"}', new_user_id::text, 'superadmin-beauty-books-world@buildstart.io')::jsonb, 'email', now(), now(), now()
  );

  UPDATE beauty_books_world_customization.user_roles SET role = 'super_admin' WHERE user_id = new_user_id;

  INSERT INTO beauty_books_world_customization.staff_accounts (owner_id, staff_user_id, staff_email, permissions)
  VALUES (new_user_id, new_user_id, 'superadmin-beauty-books-world@buildstart.io', ARRAY['all']);
END $$;

-- Scheduled Jobs (pg_cron queue drainer safety net + follow-ups)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('drain-message-queue-beauty-books-world') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-message-queue-beauty-books-world');
SELECT cron.schedule(
  'drain-message-queue-beauty-books-world',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'http://api-gw:8000/functions/v1/process-message-beauty-books-world',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODY0NDc4NjYsImV4cCI6MjEwMTgwNzg2Nn0.X3SLU9ShCNBzlwY91D1CVoHsLHOfYOv6R6eJ8UpkhsQ"}'::jsonb,
    body    := '{"trigger":"cron"}'::jsonb
  );
  $$
);

SELECT cron.unschedule('send-followups-beauty-books-world') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-followups-beauty-books-world');
SELECT cron.schedule(
  'send-followups-beauty-books-world',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'http://api-gw:8000/functions/v1/send-followups-beauty-books-world',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODY0NDc4NjYsImV4cCI6MjEwMTgwNzg2Nn0.X3SLU9ShCNBzlwY91D1CVoHsLHOfYOv6R6eJ8UpkhsQ"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

