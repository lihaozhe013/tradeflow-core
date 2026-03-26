import { appConfigData as typedConfigData } from '@/config/data';
import type {
  PaymentMethod,
  PaymentMethodConfig,
  ProductCategory,
  SelectOption,
} from '@/config/types';

// 付款方式相关配置
export const PAYMENT_METHODS = typedConfigData.paymentMethods.list;
export const DEFAULT_PAYMENT_METHOD = typedConfigData.paymentMethods.default;
export const PAYMENT_METHOD_CONFIG = typedConfigData.paymentMethods.config;

// 产品类别相关配置
export const PRODUCT_CATEGORIES = typedConfigData.productCategories.list;
export const DEFAULT_PRODUCT_CATEGORY = typedConfigData.productCategories.default;

/**
 * 获取付款方式选项（用于下拉框）
 * @returns 付款方式选项数组
 */
export const getPaymentMethodOptions = (): readonly SelectOption<PaymentMethod>[] => {
  return PAYMENT_METHODS.map((method) => ({
    value: method,
    label: method,
  }));
};

/**
 * 获取付款方式标签
 * @param value - 付款方式值
 * @returns 付款方式标签
 */
export const getPaymentMethodLabel = (value: PaymentMethod | null | undefined): string => {
  return value ?? '';
};

/**
 * 获取产品类别选项（用于下拉框）
 * @returns 产品类别选项数组
 */
export const getProductCategoryOptions = (): readonly SelectOption<ProductCategory>[] => {
  return PRODUCT_CATEGORIES.map((category) => ({
    value: category,
    label: category,
  }));
};

/**
 * 检查是否为有效的付款方式
 * @param method - 待检查的付款方式
 * @returns 是否为有效付款方式
 */
export const isValidPaymentMethod = (method: string): method is PaymentMethod => {
  return (PAYMENT_METHODS as readonly string[]).includes(method);
};

/**
 * 检查是否为有效的产品类别
 * @param category - 待检查的产品类别
 * @returns 是否为有效产品类别
 */
export const isValidProductCategory = (category: string): category is ProductCategory => {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(category);
};

/**
 * 获取付款方式配置详情
 * @param method - 付款方式
 * @returns 付款方式配置，如果不存在则返回 undefined
 */
export const getPaymentMethodConfig = (method: PaymentMethod): PaymentMethodConfig | undefined => {
  const configKey = method
    .toLowerCase()
    .replace(/['\s]/g, '_') as keyof typeof PAYMENT_METHOD_CONFIG;
  return PAYMENT_METHOD_CONFIG[configKey];
};

// 导出原始配置数据（如需要）
export const CONFIG_DATA = typedConfigData;

// 导出认证配置
export const AUTH_CONFIG = typedConfigData.auth;

// 导出服务器配置
export const SERVER_CONFIG = typedConfigData.server;

// 导出前端配置
export const FRONTEND_CONFIG = typedConfigData.frontend;

// 重新导出类型
export type {
  AppConfigData,
  PaymentMethod,
  PaymentMethodConfig,
  ProductCategory,
  SelectOption,
  AuthConfig,
  ServerConfig,
  FrontendConfig,
} from '@/config/types';
