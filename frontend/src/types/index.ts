// 通用接口类型定义
import type React from 'react';

export interface BaseResponse<T = unknown> {
  readonly success: boolean;
  readonly message?: string;
  readonly data?: T;
  readonly error?: string;
}

export interface PaginationParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

// 用户相关类型
export interface User {
  readonly id: string;
  readonly username: string;
  readonly email?: string;
  readonly role: UserRole;
  readonly permissions: readonly Permission[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserRole {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface Permission {
  readonly id: string;
  readonly name: string;
  readonly resource: string;
  readonly action: string;
}

// 认证相关类型
export interface LoginCredentials {
  readonly username: string;
  readonly password: string;
}

export interface AuthToken {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresIn: number;
}

export interface AuthState {
  readonly isAuthenticated: boolean;
  readonly user: User | null;
  readonly token: string | null;
  readonly permissions: readonly Permission[];
}

// 产品相关类型
export interface Product {
  id: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

// 库存相关类型
export interface InventoryItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unit: string;
  location?: string;
  lastUpdated: string;
}

// 价格相关类型
export interface ProductPrice {
  id: string;
  productId: string;
  product?: Product;
  price: number;
  currency: string;
  validFrom: string;
  validTo?: string;
  isActive: boolean;
}

// 合作伙伴类型
export interface Partner {
  id: string;
  name: string;
  type: 'supplier' | 'customer';
  contactInfo?: ContactInfo;
  address?: Address;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  contactPerson?: string;
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

// 交易相关类型
export interface Transaction {
  id: string;
  type: 'inbound' | 'outbound';
  partnerId: string;
  partner?: Partner;
  items: TransactionItem[];
  totalAmount: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled';
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// 财务相关类型
export interface PayableRecord {
  id: string;
  partnerId: string;
  partner?: Partner;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivableRecord {
  id: string;
  partnerId: string;
  partner?: Partner;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'pending' | 'received' | 'overdue';
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// 分析相关类型
export interface AnalysisData {
  readonly id: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly generatedAt: string;
  readonly validUntil?: string;
}

// 表单相关类型
export interface FormField {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  readonly required?: boolean;
  readonly options?: readonly { label: string; value: unknown }[];
  readonly validation?: readonly ValidationRule[];
}

export interface ValidationRule {
  readonly type: 'required' | 'min' | 'max' | 'pattern';
  readonly value?: unknown;
  readonly message: string;
}

// API 相关类型
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface ApiRequestConfig {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly data?: unknown;
  readonly params?: Record<string, unknown>;
  readonly headers?: Record<string, string>;
}

// 导出相关类型
export interface ExportConfig {
  readonly format: 'excel' | 'csv' | 'pdf';
  readonly fileName?: string;
  readonly columns?: readonly string[];
  readonly filters?: Record<string, unknown>;
}

// 应用配置类型
export interface AppConfig {
  readonly title: string;
  readonly version: string;
  readonly api: {
    readonly baseUrl: string;
    readonly timeout: number;
  };
  readonly features: {
    readonly [key: string]: boolean;
  };
  readonly i18n: {
    readonly defaultLanguage: string;
    readonly supportedLanguages: readonly string[];
  };
}

// 路由相关类型
export interface RouteConfig {
  readonly path: string;
  readonly component: React.ComponentType;
  readonly exact?: boolean;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

// 主题相关类型
export interface ThemeConfig {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
}
