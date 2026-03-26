/**
 * useAuth Hook 类型声明
 *
 * 为 useAuth.js 提供 TypeScript 类型支持
 */

import type { User } from '@/auth/auth';

/**
 * 认证上下文状态
 */
export interface AuthContextState {
  /** 当前用户 */
  readonly user: User | null;
  /** 认证令牌 */
  readonly token: string | null;
  /** 是否已认证 */
  readonly isAuthenticated: boolean;
  /** 是否加载中 */
  readonly isLoading: boolean;
  /** 错误消息 */
  readonly error: string | null;
}

/**
 * 登录结果
 */
export interface LoginResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 错误消息（失败时） */
  readonly error?: string;
}

/**
 * 认证上下文值
 */
export interface AuthContextValue extends AuthContextState {
  /**
   * 登录
   * @param username - 用户名
   * @param password - 密码
   * @returns 登录结果
   */
  login: (username: string, password: string) => Promise<LoginResult>;

  /**
   * 登出
   */
  logout: () => void;

  /**
   * 清除错误
   */
  clearError: () => void;

  /**
   * 检查权限
   * @param requiredRole - 所需角色
   * @returns 是否有权限
   */
  hasPermission: (requiredRole: 'reader' | 'editor') => boolean;
}

/**
 * useAuth Hook
 *
 * @returns 认证上下文值
 * @throws 如果在 AuthProvider 外部使用
 */
export function useAuth(): AuthContextValue;
