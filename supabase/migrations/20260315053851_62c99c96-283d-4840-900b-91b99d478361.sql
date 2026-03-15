
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'viewer');

-- Create update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Servers table
CREATE TABLE public.servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  executable_path TEXT NOT NULL DEFAULT '/usr/bin/armagetronad-dedicated',
  data_dir TEXT NOT NULL DEFAULT '/usr/share/armagetronad',
  config_dir TEXT NOT NULL DEFAULT '/etc/armagetronad',
  port INTEGER NOT NULL DEFAULT 4534,
  auto_restart BOOLEAN NOT NULL DEFAULT true,
  max_players INTEGER NOT NULL DEFAULT 16,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'starting', 'stopping', 'crashed')),
  current_map TEXT DEFAULT '',
  player_count INTEGER NOT NULL DEFAULT 0,
  cpu_percent REAL NOT NULL DEFAULT 0,
  memory_mb REAL NOT NULL DEFAULT 0,
  uptime INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Server events / logs
CREATE TABLE public.server_events (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_events_server_time ON public.server_events(server_id, occurred_at DESC);
CREATE INDEX idx_server_events_type ON public.server_events(event_type);

-- Bans
CREATE TABLE public.bans (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  ip_address TEXT DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  banned_by TEXT NOT NULL DEFAULT 'admin',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bans_server ON public.bans(server_id);

-- Metrics time-series
CREATE TABLE public.metrics (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  cpu_percent REAL NOT NULL DEFAULT 0,
  memory_mb REAL NOT NULL DEFAULT 0,
  player_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_server_time ON public.metrics(server_id, recorded_at DESC);

-- Server configs (key-value per file)
CREATE TABLE public.server_configs (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  filename TEXT NOT NULL DEFAULT 'settings_custom.cfg',
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, filename, key)
);

CREATE TRIGGER update_server_configs_updated_at BEFORE UPDATE ON public.server_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Map files metadata
CREATE TABLE public.map_files (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, filename)
);

-- Players (tracked per server)
CREATE TABLE public.players (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  ping INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT DEFAULT '',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_online BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_players_server ON public.players(server_id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  UNIQUE(user_id, role)
);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'viewer' THEN 3 END
  LIMIT 1
$$;

-- Auto-assign role on signup: first user = admin, rest = viewer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on all tables
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Servers
CREATE POLICY "Authenticated users can view servers" ON public.servers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert servers" ON public.servers
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update servers" ON public.servers
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete servers" ON public.servers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Server events
CREATE POLICY "Authenticated users can view events" ON public.server_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/moderators can insert events" ON public.server_events
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- Bans
CREATE POLICY "Authenticated users can view bans" ON public.bans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/moderators can insert bans" ON public.bans
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );
CREATE POLICY "Admins/moderators can delete bans" ON public.bans
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- Metrics
CREATE POLICY "Authenticated users can view metrics" ON public.metrics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert metrics" ON public.metrics
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Server configs
CREATE POLICY "Authenticated users can view configs" ON public.server_configs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert configs" ON public.server_configs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update configs" ON public.server_configs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete configs" ON public.server_configs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Map files
CREATE POLICY "Authenticated users can view maps" ON public.map_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert maps" ON public.map_files
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete maps" ON public.map_files
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Players
CREATE POLICY "Authenticated users can view players" ON public.players
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/moderators can insert players" ON public.players
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );
CREATE POLICY "Admins/moderators can update players" ON public.players
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );
CREATE POLICY "Admins/moderators can delete players" ON public.players
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- User roles
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for maps
INSERT INTO storage.buckets (id, name, public) VALUES ('maps', 'maps', false);

CREATE POLICY "Authenticated users can view map files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'maps');
CREATE POLICY "Admins can upload map files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'maps' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete map files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'maps' AND public.has_role(auth.uid(), 'admin'));

-- Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
