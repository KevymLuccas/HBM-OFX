-- Create table to track PDF conversions
CREATE TABLE public.conversion_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert initial row
INSERT INTO public.conversion_stats (id, total_conversions) 
VALUES ('00000000-0000-0000-0000-000000000001', 0);

-- Enable RLS but allow public read/update for the counter
ALTER TABLE public.conversion_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read conversion stats"
ON public.conversion_stats
FOR SELECT
USING (true);

CREATE POLICY "Anyone can update conversion stats"
ON public.conversion_stats
FOR UPDATE
USING (true);

-- Function to increment counter
CREATE OR REPLACE FUNCTION public.increment_conversions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.conversion_stats 
  SET total_conversions = total_conversions + 1, updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING total_conversions INTO new_count;
  
  RETURN new_count;
END;
$$;