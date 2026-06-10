-- Add agent_token column to servers table
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS agent_token TEXT DEFAULT '';

-- Update comment
COMMENT ON COLUMN public.servers.agent_token IS 'Authentication token for the host agent API';
