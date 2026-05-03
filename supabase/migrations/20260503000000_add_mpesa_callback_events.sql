CREATE TABLE IF NOT EXISTS mpesa_callback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_ip TEXT,
  user_agent TEXT,
  content_type TEXT,
  trans_id TEXT,
  checkout_request_id TEXT,
  phone_masked TEXT,
  amount NUMERIC(12,2),
  shortcode TEXT,
  payload JSONB,
  raw_body TEXT,
  result_code INTEGER,
  result_desc TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_created_at
  ON mpesa_callback_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_trans_id
  ON mpesa_callback_events (trans_id);
