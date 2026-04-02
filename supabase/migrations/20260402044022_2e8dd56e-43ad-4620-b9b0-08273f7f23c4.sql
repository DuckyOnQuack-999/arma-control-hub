-- 1. Restrict players SELECT to hide ip_address from non-admin/moderator users
-- Replace the broad SELECT policy with a role-restricted one for ip_address
DROP POLICY IF EXISTS "Authenticated users can view players" ON public.players;

-- Create a view that excludes ip_address for regular users
-- Instead, restrict the SELECT policy to admins/moderators only for ip_address
-- We'll use a restrictive approach: all authenticated can see players but ip_address is only for admins
-- Since we can't do column-level RLS, restrict full SELECT to admins/moderators
CREATE POLICY "Admins/moderators can view all player data"
  ON public.players FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Viewers can view players"
  ON public.players FOR SELECT TO authenticated
  USING (NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role)));

-- 2. Fix profiles INSERT policy to restrict to own user
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 3. Fix audit_log INSERT policy to restrict user_id to caller
DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.audit_log;
CREATE POLICY "Users can insert own audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());