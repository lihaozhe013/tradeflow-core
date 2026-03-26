import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { apiRequest } from '@/utils';
import type { RequestOptions } from '@/utils';
import type { UseSimpleApiDataReturn, UseSimpleApiReturn, ApiRequestOptions } from '@/hooks/types';

/**
 * 简化版的 API 数据获取 Hook
 *
 * 避免无限循环问题，适合简单的数据获取场景
 *
 * @example
 * ```typescript
 * const { data, loading, refetch } = useSimpleApiData<User[]>('/api/users');
 * ```
 *
 * @param url - API 地址
 * @param defaultData - 默认数据
 * @returns 数据状态和刷新方法
 */
export const useSimpleApiData = <T = unknown>(
  url: string,
  defaultData: T | null = null,
): UseSimpleApiDataReturn<T> => {
  const [data, setData] = useState<T | null>(defaultData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 来稳定 defaultData，避免依赖变化导致的无限循环
  const stableDefaultData = useRef(defaultData);

  // 只在第一次时设置，后续不再更新
  if (stableDefaultData.current === null && defaultData !== null) {
    stableDefaultData.current = defaultData;
  }

  const fetchData = useCallback(async () => {
    if (!url) return;

    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest<T>(url);
      setData(response ?? stableDefaultData.current);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请求失败';
      setError(errorMessage);
      console.error(`API调用失败 [${url}]:`, err);
    } finally {
      setLoading(false);
    }
  }, [url]);

  // 只在 URL 变化时重新获取数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
};

/**
 * 简化版的 API 操作 Hook
 *
 * 提供基础的 HTTP 请求方法，不包含复杂的状态管理
 *
 * @example
 * ```typescript
 * const { loading, get, post } = useSimpleApi();
 *
 * const users = await get<User[]>('/api/users');
 * await post('/api/users', { name: 'John' });
 * ```
 *
 * @returns API 操作方法和加载状态
 */
export const useSimpleApi = (): UseSimpleApiReturn => {
  const [loading, setLoading] = useState(false);

  /**
   * 通用请求方法
   */
  const request = useCallback(
    async <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> => {
      try {
        setLoading(true);
        const response = await apiRequest<T>(url, options);
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '请求失败';
        message.error(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Blob 请求方法（用于文件下载等）
   */
  const requestBlob = useCallback(
    async (url: string, options: RequestOptions = {}): Promise<Blob> => {
      try {
        setLoading(true);
        const response = await apiRequest<Blob>(url, { ...options, responseType: 'blob' });
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '请求失败';
        message.error(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * GET 请求
   */
  const get = useCallback(
    <T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> => {
      return request<T>(url, { method: 'GET', ...options });
    },
    [request],
  );

  /**
   * POST 请求
   */
  const post = useCallback(
    <T = unknown>(url: string, data?: unknown, options: ApiRequestOptions = {}): Promise<T> => {
      return request<T>(url, {
        method: 'POST',
        body: JSON.stringify(data),
        ...options,
      });
    },
    [request],
  );

  /**
   * POST 请求（返回 Blob）
   */
  const postBlob = useCallback(
    (url: string, data?: unknown, options: ApiRequestOptions = {}): Promise<Blob> => {
      return requestBlob(url, {
        method: 'POST',
        body: JSON.stringify(data),
        ...options,
      });
    },
    [requestBlob],
  );

  /**
   * PUT 请求
   */
  const put = useCallback(
    <T = unknown>(url: string, data?: unknown, options: ApiRequestOptions = {}): Promise<T> => {
      return request<T>(url, {
        method: 'PUT',
        body: JSON.stringify(data),
        ...options,
      });
    },
    [request],
  );

  /**
   * DELETE 请求
   */
  const del = useCallback(
    <T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> => {
      return request<T>(url, { method: 'DELETE', ...options });
    },
    [request],
  );

  return {
    loading,
    get,
    post,
    postBlob,
    put,
    delete: del,
    request,
  };
};

export default useSimpleApiData;
