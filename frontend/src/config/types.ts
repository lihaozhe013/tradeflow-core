import type rawConfig from '@/build-config/frontendConfig.json';
export type PaymentMethod = string;
export type ProductCategory = string;
export interface PaymentMethodConfig {
  readonly label: string;
  readonly code: string;
}
export interface SelectOption<T = string> {
  readonly value: T;
  readonly label: string;
}
export type AuthConfig = (typeof rawConfig)['auth'];
export type ServerConfig = (typeof rawConfig)['server'];
