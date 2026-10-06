-- Add isolated MCP transaction drafts; production inbound/outbound tables remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS transaction_drafts (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  partner_code TEXT,
  partner_text TEXT,
  product_code TEXT,
  product_text TEXT,
  quantity INTEGER,
  unit_price DOUBLE PRECISION,
  transaction_date TEXT,
  invoice_date TEXT,
  invoice_number TEXT,
  receipt_number TEXT,
  order_number TEXT,
  remark TEXT,
  first_payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  row_index INTEGER NOT NULL CHECK (row_index >= 0),
  owner_username TEXT REFERENCES users(username) ON UPDATE CASCADE ON DELETE SET NULL,
  source_id TEXT NOT NULL,
  source_connection_id TEXT,
  last_modified_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP(3),
  reject_reason TEXT,
  approved_record_id INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transaction_drafts_submission_row_key UNIQUE (submission_key, request_id, row_index)
);

CREATE INDEX IF NOT EXISTS transaction_drafts_direction_status_created_at_idx
  ON transaction_drafts(direction, status, created_at);
CREATE INDEX IF NOT EXISTS transaction_drafts_submission_key_created_at_idx
  ON transaction_drafts(submission_key, created_at);

COMMIT;
