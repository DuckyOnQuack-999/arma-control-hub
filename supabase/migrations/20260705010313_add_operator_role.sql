-- Add 'operator' role to app_role enum
-- Note: Cannot add value conditionally, but if it already exists this will error (which is fine)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'operator' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE public.app_role ADD VALUE 'operator';
    END IF;
END$$;
