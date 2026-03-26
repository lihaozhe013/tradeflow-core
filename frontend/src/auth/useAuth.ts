import { useContext } from 'react';
import AuthContext from '@/auth/AuthContext';
import type { AuthContextValue } from '@/auth/useAuth.d';

/**
 * 认证 Hook
 *
 * 用于访问认证上下文，获取用户信息和认证方法
 *
 * @example
 * ```typescript
 * const { user, isAuthenticated, login, logout } = useAuth();
 *
 * // 登录
 * const result = await login('username', 'password');
 * if (result.success) {
 *   console.log('登录成功');
 * }
 *
 * // 检查权限
 * if (hasPermission('editor')) {
 *   console.log('有编辑权限');
 * }
 * ```
 *
 * @returns 认证上下文值
 * @throws 如果在 AuthProvider 外部使用
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default useAuth;
