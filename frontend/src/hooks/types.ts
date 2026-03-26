/**
 * Hooks 模块类型定义
 *
 * 为所有自定义 React Hooks 提供 TypeScript 类型支持
 */

import type { RequestOptions } from '@/utils';

/**
 * API 请求选项接口（扩展基础 RequestOptions）
 */
export interface ApiRequestOptions extends Omit<RequestOptions, 'method' | 'body'> {
  /** 静默模式，不显示错误消息 */
  readonly silent?: boolean;
}

/**
 * API Hook 返回接口
 */
export interface UseApiReturn {
  /** 加载状态 */
  readonly loading: boolean;
  /** 错误消息 */
  readonly error: string | null;
  /** 通用请求方法 */
  readonly request: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>;
  /** GET 请求 */
  readonly get: <T = unknown>(url: string, options?: ApiRequestOptions) => Promise<T>;
  /** POST 请求 */
  readonly post: <T = unknown>(
    url: string,
    data?: unknown,
    options?: ApiRequestOptions,
  ) => Promise<T>;
  /** PUT 请求 */
  readonly put: <T = unknown>(
    url: string,
    data?: unknown,
    options?: ApiRequestOptions,
  ) => Promise<T>;
  /** DELETE 请求 */
  readonly delete: <T = unknown>(url: string, options?: ApiRequestOptions) => Promise<T>;
  /** 文件上传 */
  readonly upload: <T = unknown>(
    url: string,
    formData: FormData,
    options?: ApiRequestOptions,
  ) => Promise<T>;
  /** 文件下载 */
  readonly download: (url: string, filename?: string, options?: ApiRequestOptions) => Promise<void>;
  /** 清除错误状态 */
  readonly clearError: () => void;
}

/**
 * API 数据获取 Hook 选项
 */
export interface UseApiDataOptions<T> {
  /** 是否立即加载数据 */
  readonly immediate?: boolean;
  /** 成功回调 */
  readonly onSuccess?: (data: T) => void;
  /** 错误回调 */
  readonly onError?: (error: Error) => void;
  /** 默认数据 */
  readonly defaultData?: T | null;
}

/**
 * API 数据 Hook 返回接口
 */
export interface UseApiDataReturn<T> {
  /** 数据 */
  readonly data: T | null;
  /** 加载状态 */
  readonly loading: boolean;
  /** 错误消息 */
  readonly error: string | null;
  /** 刷新数据 */
  readonly refresh: () => Promise<T | null>;
  /** 获取数据（可控制是否自动创建） */
  readonly fetchData: (autoCreate?: boolean) => Promise<T | null>;
  /** 设置数据 */
  readonly setData: (data: T | null) => void;
  /** 清除错误状态 */
  readonly clearError: () => void;
}

/**
 * 简化版 API 数据 Hook 返回接口
 */
export interface UseSimpleApiDataReturn<T> {
  /** 数据 */
  readonly data: T | null;
  /** 加载状态 */
  readonly loading: boolean;
  /** 错误消息 */
  readonly error: string | null;
  /** 重新获取数据 */
  readonly refetch: () => Promise<void>;
}

/**
 * 简化版 API Hook 返回接口
 */
export interface UseSimpleApiReturn {
  /** 加载状态 */
  readonly loading: boolean;
  /** 通用请求方法 */
  readonly request: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>;
  /** GET 请求 */
  readonly get: <T = unknown>(url: string, options?: ApiRequestOptions) => Promise<T>;
  /** POST 请求 */
  readonly post: <T = unknown>(
    url: string,
    data?: unknown,
    options?: ApiRequestOptions,
  ) => Promise<T>;
  /** POST 请求（返回 Blob） */
  readonly postBlob: (url: string, data?: unknown, options?: ApiRequestOptions) => Promise<Blob>;
  /** PUT 请求 */
  readonly put: <T = unknown>(
    url: string,
    data?: unknown,
    options?: ApiRequestOptions,
  ) => Promise<T>;
  /** DELETE 请求 */
  readonly delete: <T = unknown>(url: string, options?: ApiRequestOptions) => Promise<T>;
}
