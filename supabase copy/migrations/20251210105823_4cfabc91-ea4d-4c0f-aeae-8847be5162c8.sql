-- Create conversions history table
CREATE TABLE public.conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read conversions
CREATE POLICY "Anyone can read conversions"
ON public.conversions
FOR SELECT
USING (true);

-- Allow anyone to insert conversions
CREATE POLICY "Anyone can insert conversions"
ON public.conversions
FOR INSERT
WITH CHECK (true);

-- Reset conversion_stats counter
UPDATE public.conversion_stats 
SET total_conversions = 0, updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Enable realtime for conversions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversions;