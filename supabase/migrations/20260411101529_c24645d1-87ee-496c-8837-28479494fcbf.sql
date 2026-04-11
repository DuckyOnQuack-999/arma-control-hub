-- Safely re-apply the new user trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Safe publication adds (ignore if already present)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.server_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tighten profiles SELECT: own row only, admins see all
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Remove client-side audit log INSERT (service role only)
DROP POLICY IF EXISTS "Users can insert own audit entries" ON audit_log;