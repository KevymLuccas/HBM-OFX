-- Create storage bucket for bank layout screenshots
INSERT INTO storage.buckets (id, name, public) 
VALUES ('bank-layouts', 'bank-layouts', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public read access
CREATE POLICY "Public read access for bank layouts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'bank-layouts');

-- Create policy for authenticated insert/update (or anonymous for now since no auth)
CREATE POLICY "Anyone can upload bank layouts"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'bank-layouts');

CREATE POLICY "Anyone can update bank layouts"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'bank-layouts');
