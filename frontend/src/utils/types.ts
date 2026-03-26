/**
 * HTTP 请求相关类型定义
 */

// HTTP 方法类型
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// 响应类型
export type ResponseType = 'json' | 'blob' | 'text' | 'arrayBuffer' | 'formData';

// 请求选项接口
export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  readonly method?: HttpMethod;
  readonly body?: BodyInit | Record<string, unknown> | null;
  readonly responseType?: ResponseType;
}

// 上传选项接口
export interface UploadOptions extends Omit<RequestOptions, 'body' | 'method'> {
  readonly onProgress?: (progress: number) => void;
}

// 下载选项接口
export interface DownloadOptions extends Omit<RequestOptions, 'method'> {
  readonly onProgress?: (progress: number) => void;
}

// 请求实例接口
export interface RequestInstance {
  // 基础请求方法
  <T = unknown>(url: string, options?: RequestOptions): Promise<T>;

  // 便捷方法
  get<T = unknown>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<T>;
  delete<T = unknown>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;

  // 文件操作方法
  upload<T = unknown>(url: string, formData: FormData, options?: UploadOptions): Promise<T>;
  download(url: string, filename?: string, options?: DownloadOptions): Promise<void>;
}

// 请求错误类
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'RequestError';

    // 维护正确的原型链
    Object.setPrototypeOf(this, RequestError.prototype);
  }
}

// 网络错误类
export class NetworkError extends Error {
  constructor(message = '网络错误，请检查您的网络连接') {
    super(message);
    this.name = 'NetworkError';

    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

// 认证错误类
export class AuthenticationError extends Error {
  constructor(message = '认证失败，请重新登录') {
    super(message);
    this.name = 'AuthenticationError';

    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

// 权限错误类
export class AuthorizationError extends Error {
  constructor(message = '权限不足，无法执行此操作') {
    super(message);
    this.name = 'AuthorizationError';

    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}
