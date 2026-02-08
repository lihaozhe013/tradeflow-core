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
 * AppConfig Interface
 */
export interface AppConfig {
  database?: {
    type?: 'sqlite' | 'postgresql';
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    dbName?: string;
  };
  server?: ServerConfig;
  frontend?: FrontendConfig;
}
