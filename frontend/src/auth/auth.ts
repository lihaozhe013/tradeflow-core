import type { User, LoginResponse, GetCurrentUserResponse } from '@/auth/auth.types';
export type { User, LoginResponse, GetCurrentUserResponse, TokenManager, UserManager, AuthAPI } from '@/auth/auth.types';

// 认证工具函数
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// Token 管理
export const tokenManager = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  
  setToken(token: string | null) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  },
  
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

// 用户信息管理
export const userManager = {
  getUser(): User | null {
    const userData = localStorage.getItem(USER_KEY);
    if (!userData) return null;
    try {
      return JSON.parse(userData) as User;
    } catch {
      // 存储被污染或版本变更导致解析失败时，清理并返回 null
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  
  setUser(user: User | null) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }
};

// 检查是否已认证
export const isAuthenticated = () => {
  const token = tokenManager.getToken();
  const user = userManager.getUser();
  return !!(token && user);
};

// 检查用户角色
export const hasRole = (requiredRole: 'reader' | 'editor') => {
  const user = userManager.getUser();
  if (!user) return false;
  
  if (requiredRole === 'reader') {
    return user.role === 'reader' || user.role === 'editor';
  }
  if (requiredRole === 'editor') {
    return user.role === 'editor';
  }
  return false;
};

// API 调用
export const authAPI = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message ?? 'Log in failed');
    }
    
    return response.json() as Promise<LoginResponse>;
  },
  
  async getCurrentUser(): Promise<GetCurrentUserResponse> {
    const token = tokenManager.getToken();
    
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch('/api/auth/me', {
      headers,
    });
    
    if (!response.ok) {
      throw new Error('Failed to get user info');
    }
    
    return response.json() as Promise<GetCurrentUserResponse>;
  },
  
  logout() {
    // 无状态JWT，只需清除本地存储
    tokenManager.clearToken();
    userManager.setUser(null);
  }
};
