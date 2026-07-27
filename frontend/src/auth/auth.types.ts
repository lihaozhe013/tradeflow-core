export type Role = 'reader' | 'editor' | 'superuser';

export interface User {
  id: string | number;
  username: string;
  role: Role;
  [key: string]: unknown;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
  message?: string;
}

export interface GetCurrentUserResponse {
  success: boolean;
  user: User;
}

export interface TokenManager {
  getToken(): string | null;
  setToken(token: string | null): void;
  clearToken(): void;
}

export interface UserManager {
  getUser(): User | null;
  setUser(user: User | null): void;
}

export interface AuthAPI {
  login(username: string, password: string): Promise<LoginResponse>;
  getCurrentUser(): Promise<GetCurrentUserResponse>;
  logout(): void;
}
