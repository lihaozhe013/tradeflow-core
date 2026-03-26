/**
 * HTTP 请求工具模块
 * 提供统一的请求接口，自动处理认证、错误等
 */

import { tokenManager } from '../auth/auth';
import type { RequestOptions, UploadOptions, DownloadOptions, RequestInstance } from './types';
import { RequestError, NetworkError, AuthenticationError, AuthorizationError } from './types';

/**
 * 创建请求实例
 * @param baseURL - API 基础路径
 * @returns 请求实例
 */
const createRequest = (baseURL = ''): RequestInstance => {
  /**
   * 基础请求方法
   * @param url - 请求路径
   * @param options - 请求选项
   * @returns Promise 响应数据
   */
  const request = async <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> => {
    const token = tokenManager.getToken();
    const { responseType = 'json', body: requestBody, ...fetchOptions } = options;

    // 默认配置
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string> | undefined),
    };

    // 添加认证头
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body: BodyInit | null = null;

    // 处理 body
    if (requestBody && typeof requestBody === 'object' && !(requestBody instanceof FormData)) {
      body = JSON.stringify(requestBody);
    } else if (requestBody) {
      body = requestBody as BodyInit;
    }

    const config: RequestInit = {
      ...fetchOptions,
      headers,
      ...(body && { body }),
    };

    const fullUrl = `${baseURL}${url}`;

    try {
      const response = await fetch(fullUrl, config);

      // 处理 401 错误（token过期或无效）
      if (response.status === 401) {
        // 清除本地存储的认证信息
        tokenManager.clearToken();

        // 重定向到登录页（如果当前不在登录页）
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }

        throw new AuthenticationError();
      }

      // 处理 403 错误（权限不足）
      if (response.status === 403) {
        throw new AuthorizationError();
      }

      // 处理其他错误状态码
      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = {};
        }

        const errorMessage =
          (errorData as { message?: string }).message ?? `HTTP Error: ${response.status}`;

        throw new RequestError(errorMessage, response.status, response.statusText, errorData);
      }

      // 根据 responseType 处理响应
      switch (responseType) {
        case 'blob':
          return (await response.blob()) as T;
        case 'text':
          return (await response.text()) as T;
        case 'arrayBuffer':
          return (await response.arrayBuffer()) as T;
        case 'formData':
          return (await response.formData()) as T;
        case 'json':
        default: {
          // 尝试解析 JSON 响应
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            return (await response.json()) as T;
          }

          // 对于非 JSON 响应，返回 response 对象
          return response as T;
        }
      }
    } catch (error) {
      // 网络错误或其他错误
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError();
      }

      // 重新抛出已知错误
      if (
        error instanceof RequestError ||
        error instanceof AuthenticationError ||
        error instanceof AuthorizationError ||
        error instanceof NetworkError
      ) {
        throw error;
      }

      // 包装未知错误
      throw new RequestError(error instanceof Error ? error.message : '请求失败');
    }
  };

  // 便捷方法
  request.get = <T = unknown>(
    url: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<T> => {
    return request<T>(url, { method: 'GET', ...options });
  };

  request.post = <T = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<T> => {
    return request<T>(url, {
      method: 'POST',
      body: data as Record<string, unknown>,
      ...options,
    });
  };

  request.put = <T = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<T> => {
    return request<T>(url, {
      method: 'PUT',
      body: data as Record<string, unknown>,
      ...options,
    });
  };

  request.delete = <T = unknown>(
    url: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<T> => {
    return request<T>(url, { method: 'DELETE', ...options });
  };

  // 文件上传
  request.upload = <T = unknown>(
    url: string,
    formData: FormData,
    options: UploadOptions = {},
  ): Promise<T> => {
    const { onProgress, ...restOptions } = options;

    // TODO: 实现上传进度监听（需要使用 XMLHttpRequest 或其他方式）
    if (onProgress) {
      console.warn('Upload progress tracking is not yet implemented');
    }

    return request<T>(url, {
      method: 'POST',
      body: formData,
      headers: {
        // 不设置 Content-Type，让浏览器自动设置（包含 boundary）
        ...(restOptions.headers as Record<string, string>),
        'Content-Type': undefined as unknown as string,
      },
      ...restOptions,
    });
  };

  // 文件下载
  request.download = async (
    url: string,
    filename?: string,
    options: DownloadOptions = {},
  ): Promise<void> => {
    const { onProgress, ...restOptions } = options;

    // TODO: 实现下载进度监听
    if (onProgress) {
      console.warn('Download progress tracking is not yet implemented');
    }

    const blob = await request<Blob>(url, {
      ...restOptions,
      responseType: 'blob',
    });

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename ?? 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  };

  return request as RequestInstance;
};

// 创建默认的 API 请求实例
export const apiRequest = createRequest('/api');

// 导出 createRequest 函数供其他模块使用
export { createRequest };

// 导出错误类
export { RequestError, NetworkError, AuthenticationError, AuthorizationError } from '@/utils/types';

// 导出类型
export type {
  RequestOptions,
  UploadOptions,
  DownloadOptions,
  RequestInstance,
  HttpMethod,
  ResponseType,
} from '@/utils/types';

export default apiRequest;
