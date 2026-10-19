import rawConfig from '@/build-config/frontendConfig.json';
export const AUTH_CONFIG = rawConfig.auth;
export const SERVER_CONFIG = rawConfig.server;
export type {
  PaymentMethod,
  ProductCategory,
  PaymentMethodConfig,
  SelectOption,
  AuthConfig,
  ServerConfig
} from './types';
