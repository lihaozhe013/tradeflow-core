import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { apiRequest } from '@/utils';
import { useAuth } from '@/auth/useAuth';
import type { RequestOptions } from '@/utils';
import type {
  UseApiReturn,
  UseApiDataReturn,
  UseApiDataOptions,
  ApiRequestOptions,
} from '@/hooks/types';

/**
 * 通用 API 请求 Hook
 *
 * 自动处理加载状态、错误处理、认证等功能
 *
 * @example
 * ```typescript
 * const { loading, get, post } = useApi();
 *
 * // 获取数据
 * const users = await get<User[]>('/api/users');
 *
 * // 提交数据
 * const result = await post<CreateResponse>('/api/users', { name: 'John' });
 * ```
 *
 * @returns API 操作方法和状态
 */
export const useApi = (): UseApiReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logout } = useAuth();

  /**
   * 通用请求方法
   */
  const request = useCallback(
    async <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<T>(url, options);
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '请求失败';
        setError(errorMessage);

        // 如果是认证错误，自动登出
        if (errorMessage.includes('认证失败') || errorMessage.includes('401')) {
          message.error('登录已过期，请重新登录');
          logout();
        }

        // 显示错误消息（可以通过配置关闭）
        const apiOptions = options as ApiRequestOptions;
        if (!apiOptions.silent) {
          message.error(errorMessage);
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [logout],
  );

  /**
   * GET 请求
   */
  const get = useCallback(
    async <T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> => {
      return await request<T>(url, { method: 'GET', ...options });
    },
    [request],
  );

  /**
   * POST 请求
   */
  const post = useCallback(
    async <T = unknown>(
      url: string,
      data?: unknown,
      options: ApiRequestOptions = {},
    ): Promise<T> => {
      return await request<T>(url, {
        method: 'POST',
        body: JSON.stringify(data),
        ...options,
      });
    },
    [request],
  );

  /**
   * PUT 请求
   */
  const put = useCallback(
    async <T = unknown>(
      url: string,
      data?: unknown,
      options: ApiRequestOptions = {},
    ): Promise<T> => {
      return await request<T>(url, {
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
    async <T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> => {
      return await request<T>(url, { method: 'DELETE', ...options });
    },
    [request],
  );

  /**
   * 文件上传
   */
  const upload = useCallback(
    async <T = unknown>(
      url: string,
      formData: FormData,
      options: ApiRequestOptions = {},
    ): Promise<T> => {
      const { headers, ...restOptions } = options;
      return await request<T>(url, {
        method: 'POST',
        body: formData,
        // 不设置 Content-Type，让浏览器自动设置 multipart/form-data
        ...restOptions,
      });
    },
    [request],
  );

  /**
   * 文件下载
   */
  const download = useCallback(
    async (url: string, filename?: string, options: ApiRequestOptions = {}): Promise<void> => {
      try {
        setLoading(true);
        const response = await apiRequest<Response>(url, {
          ...options,
          responseType: 'blob',
        });

        if (response instanceof Response) {
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename ?? 'download';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);

          message.success('文件下载成功');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '下载失败';
        message.error(`下载失败: ${errorMessage}`);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    error,
    request,
    get,
    post,
    put,
    delete: del,
    upload,
    download,
    clearError: () => setError(null),
  };
};

/**
 * 专门用于数据获取的 Hook
 *
 * 支持自动加载、重试、缓存等功能
 *
 * @example
 * ```typescript
 * const { data, loading, refresh } = useApiData<User[]>('/api/users', {
 *   immediate: true,
 *   onSuccess: (data) => console.log('成功', data),
 *   onError: (error) => console.error('失败', error),
 * });
 * ```
 *
 * @param url - API 地址
 * @param options - 配置选项
 * @returns 数据状态和操作方法
 */
export const useApiData = <T = unknown>(
  url: string,
  options: UseApiDataOptions<T> = {},
): UseApiDataReturn<T> => {
  const {
    immediate = true, // 是否立即加载
    onSuccess, // 成功回调
    onError, // 错误回调
    defaultData = null, // 默认数据
  } = options;

  const [data, setData] = useState<T | null>(defaultData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { get, post } = useApi();

  // 使用 ref 存储回调函数，避免依赖项变化
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // 更新 ref
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  /**
   * 获取数据方法
   *
   * @param autoCreate - 当数据未生成（503）时，是否自动创建
   */
  const fetchData = useCallback(
    async (autoCreate = true): Promise<T | null> => {
      try {
        setLoading(true);
        setError(null);

        const response = await get<T>(url, { silent: true });

        // 处理 503 状态 - 数据未生成，尝试自动创建
        if (
          autoCreate &&
          response &&
          typeof response === 'object' &&
          'status' in response &&
          response.status === 503
        ) {
          await post(url.replace('GET', 'POST'), {});
          return await fetchData(false);
        }

        const finalData = response || defaultData;
        setData(finalData);
        onSuccessRef.current?.(finalData as T);
        return finalData;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '请求失败';
        setError(errorMessage);
        onErrorRef.current?.(err instanceof Error ? err : new Error(errorMessage));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [url, get, post, defaultData],
  );

  /**
   * 刷新数据
   */
  const refresh = useCallback(() => {
    return fetchData();
  }, [fetchData]);

  // 立即加载数据
  useEffect(() => {
    if (immediate && url) {
      fetchData();
    }
  }, [immediate, url, fetchData]);

  return {
    data,
    loading,
    error,
    refresh,
    fetchData,
    setData,
    clearError: () => setError(null),
  };
};

export default useApi;
