-- Additive upgrade. Apply before starting a backend that supports user MCP connections.
BEGIN;
CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  owner_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
  client TEXT NOT NULL,
  device_id TEXT NOT NULL,
  token_sha256 TEXT NOT NULL UNIQUE,
  tools TEXT[] NOT NULL,
  password_version TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS mcp_connections_owner_username_created_at_idx
  ON mcp_connections(owner_username, created_at);
COMMIT;
