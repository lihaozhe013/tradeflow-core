import React, { createContext, useReducer, useEffect, type ReactNode } from 'react';
import { tokenManager, userManager, authAPI } from '@/auth/auth';
import { useTranslation } from 'react-i18next';
import type { User } from '@/auth/auth';
import type { AuthContextValue, LoginResult } from '@/auth/useAuth.d';

/**
 * Certification Status Interface
 */
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Action Type
 */
type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_USER'; payload: User | null };

/**
 * AuthProvider Props
 */
interface AuthProviderProps {
  children: ReactNode;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

/**
 * Reducer
 */
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };

    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
      };

    default:
      return state;
  }
};

// Create Context
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider
 * 
 * Provide authentication context and manage user authentication status
 * 
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const { t } = useTranslation();

  // Check locally stored authentication information during initialization
  useEffect(() => {
    const initAuth = async () => {
      const token = tokenManager.getToken();

      try {
        // Attempt to verify or retrieve the current user from the server (supports tokenless access when Auth is disabled)
        const response = await authAPI.getCurrentUser();

        if (response.success && response.user) {
          const activeToken = token ?? 'dev-mode-token';
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: { user: response.user, token: activeToken },
          });
          // Only save when a valid token is present; otherwise, it may be in Dev Mode
          if (token) {
            tokenManager.setToken(token);
          }
          userManager.setUser(response.user);
          return;
        }
      } catch {
        // Verification failed, clear status
      }

      // Verification failed or no response received; performing logout cleanup
      tokenManager.clearToken();
      userManager.setUser(null);
      dispatch({ type: 'LOGOUT' });
    };

    void initAuth();
  }, []);

  /**
   * Login
   */
  const login = async (username: string, password: string): Promise<LoginResult> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const response = await authAPI.login(username, password);

      if (response.success) {
        const { token, user } = response;

        // Save to local storage
        tokenManager.setToken(token);
        userManager.setUser(user);

        // Update Status
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user, token },
        });

        return { success: true };
      } else {
        throw new Error(response.message ?? t('auth.loginFailed'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('auth.loginFailed');
      dispatch({
        type: 'LOGIN_FAILURE',
        payload: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Logout
   */
  const logout = (): void => {
    authAPI.logout();
    dispatch({ type: 'LOGOUT' });
  };

  /**
   * Clear Error
   */
  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  /**
   * Inspection Authority
   */
  const hasPermission = (requiredRole: 'reader' | 'editor'): boolean => {
    if (!state.user) return false;

    if (requiredRole === 'reader') {
      return state.user.role === 'reader' || state.user.role === 'editor';
    }
    if (requiredRole === 'editor') {
      return state.user.role === 'editor';
    }
    return false;
  };

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    clearError,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
