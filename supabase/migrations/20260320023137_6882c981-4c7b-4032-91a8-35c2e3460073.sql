INSERT INTO storage.buckets (id, name, public) VALUES ('binaries', 'binaries', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can upload binaries" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'binaries' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Anyone can download binaries" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'binaries');

CREATE POLICY "Admins can delete binaries" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'binaries' AND public.has_role(auth.uid(), 'admin'::public.app_role));