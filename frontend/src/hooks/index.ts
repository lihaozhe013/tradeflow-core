/**
 * Hooks 模块统一导出
 *
 * 提供所有自定义 React Hooks 和相关类型
 */

// 导出 Hooks
export { useApi, useApiData } from '@/hooks/useApi';
export { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';

// 导出类型
export type {
  ApiRequestOptions,
  UseApiReturn,
  UseApiDataReturn,
  UseApiDataOptions,
  UseSimpleApiReturn,
  UseSimpleApiDataReturn,
} from '@/hooks/types';

/**
 * 使用示例:
 *
 * @example 完整的 API Hook
 * ```typescript
 * import { useApi, useApiData, type UseApiReturn } from '@/hooks';
 *
 * // 基础操作
 * const { loading, get, post } = useApi();
 * const users = await get<User[]>('/api/users');
 *
 * // 数据获取
 * const { data, loading, refresh } = useApiData<User[]>('/api/users', {
 *   immediate: true,
 *   onSuccess: (data) => console.log(data),
 * });
 * ```
 *
 * @example 简化版 API Hook
 * ```typescript
 * import { useSimpleApi, useSimpleApiData } from '@/hooks';
 *
 * // 简单操作
 * const { loading, get, post } = useSimpleApi();
 *
 * // 简单数据获取
 * const { data, loading, refetch } = useSimpleApiData<User[]>('/api/users');
 * ```
 */
