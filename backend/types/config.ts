/**
 * HTTP Port Interface
 */
export interface ServerConfig {
  httpPort?: number;
}

/**
 * FrontendConfig Interface
 */
export interface FrontendConfig {
  hostByBackend?: boolean;
  distPath?: string;
  fallbackToIndex?: boolean;
}

/**
 * AuthConfig Interface
 */
export interface AuthConfig {
  enabled: boolean;
  tokenExpiresInHours?: number;
  loginRateLimit?: {
    windowMinutes: number;
    maxAttempts: number;
  };
  allowExportsForReader?: boolean;
}

export type McpToolName =
  | 'search_partners'
  | 'search_products'
  | 'get_inventory'
  | 'list_transactions'
  | 'get_receivables'
  | 'get_payables'
  | 'get_analysis';

export interface McpCredentialConfig {
  id: string;
  tokenSha256: string;
  expiresAt: string;
  enabled?: boolean;
  tools: McpToolName[];
}

export interface McpConfig {
  enabled: boolean;
  allowedHosts: string[];
  allowedOrigins: string[];
  requestsPerMinute?: number;
  maxConcurrentRequests?: number;
  maxConcurrentAnalysis?: number;
  credentials: McpCredentialConfig[];
}

/**
 * AppConfig Interface
 */
export interface AppConfig {
  currency_unit_symbol?: string;
  pagination_limit?: number;
  database?: {
    type?: 'sqlite' | 'postgresql';
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    dbName?: string;
    maxConnections?: number;
    bootstrap?: {
      createDatabase?: boolean;
      maintenanceDatabase?: string;
      lockTimeoutMs?: number;
      statementTimeoutMs?: number;
    };
  };
  auth?: AuthConfig;
  mcp?: McpConfig;
  server?: ServerConfig;
  frontend?: FrontendConfig;
}
