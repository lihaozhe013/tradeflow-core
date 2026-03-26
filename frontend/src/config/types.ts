import rawConfig from '@/config/frontendConfig.json';
export type PaymentMethod = (typeof rawConfig)['paymentMethods']['list'][number];
export interface PaymentMethodConfig {
  readonly label: string;
  readonly code: string;
}
export interface PaymentMethodsConfig {
  readonly list: readonly PaymentMethod[];
  readonly default: PaymentMethod;
  readonly config: (typeof rawConfig)['paymentMethods']['config'];
}
export type ProductCategory = (typeof rawConfig)['productCategories']['list'][number];
export interface ProductCategoriesConfig {
  readonly list: readonly ProductCategory[];
  readonly default: ProductCategory;
}

export type AuthConfig = (typeof rawConfig)['auth'];
export type ServerConfig = (typeof rawConfig)['server'];
export interface FrontendConfig {
  readonly hostByBackend: boolean;
  readonly distPath: string;
  readonly fallbackToIndex: boolean;
}

export interface AppConfigData {
  readonly currency_unit_symbol: string;
  readonly paymentMethods: PaymentMethodsConfig;
  readonly productCategories: ProductCategoriesConfig;
  readonly auth: AuthConfig;
  readonly server: ServerConfig;
  readonly frontend: FrontendConfig;
}
export interface SelectOption<T = string> {
  readonly value: T;
  readonly label: string;
}

export const currency_unit_symbol = rawConfig.currency_unit_symbol;
