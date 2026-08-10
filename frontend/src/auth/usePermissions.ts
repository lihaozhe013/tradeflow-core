import { useAuth } from '@/auth/useAuth';
import { useTranslation } from 'react-i18next';
import type { User } from '@/auth/auth';
import { hasCapability } from '@/auth/permissions';
import type { Capability } from '@/auth/permissions';

/**
 * 角色类型
 */
type Role = 'reader' | 'editor' | 'superuser';

/**
 * 按钮属性接口
 */
interface ButtonProps {
  /** 是否禁用 */
  readonly disabled: boolean;
  /** 提示文本 */
  readonly title: string;
}

/**
 * 权限管理 Hook 返回接口
 */
export interface UsePermissionsReturn {
  /** 当前用户信息 */
  readonly user: User | null;
  /** 基础权限检查 */
  readonly hasPermission: (requiredRole: Role) => boolean;
  /** Capability-level permission check */
  readonly hasCapability: (capability: Capability) => boolean;
  /** Whether business data write operations are available */
  readonly canWrite: boolean;
  /** Whether reader-compatible POST operations are available */
  readonly canUseReaderPost: boolean;
  /** Whether user administration is available */
  readonly canManageUsers: boolean;
  /** 是否为编辑用户 */
  readonly isEditor: () => boolean;
  /** 是否为超级用户 */
  readonly isSuperuser: () => boolean;
  /** 是否为只读用户 */
  readonly isReader: () => boolean;
  /** 检查是否可以执行写操作 */
  readonly canEdit: () => boolean;
  /** 检查是否可以查看 */
  readonly canView: () => boolean;
  /** 检查是否可以查看所有日志 */
  readonly canViewAllLogs: () => boolean;
  /** 权限相关的样式类 */
  readonly getPermissionClass: (requiredRole?: Role) => string;
  /** 权限相关的按钮属性 */
  readonly getButtonProps: (requiredRole?: Role) => ButtonProps;
}

/**
 * 权限管理 Hook
 *
 * 提供基于角色的权限检查功能
 *
 * @example
 * ```typescript
 * const { canEdit, getButtonProps } = usePermissions();
 *
 * // 检查是否可以编辑
 * if (canEdit()) {
 *   console.log('有编辑权限');
 * }
 *
 * // 获取按钮属性（带权限控制）
 * <Button {...getButtonProps('editor')}>编辑</Button>
 * ```
 *
 * @returns 权限管理相关的方法和状态
 */
export const usePermissions = (): UsePermissionsReturn => {
  const { user, hasPermission } = useAuth();
  const { t } = useTranslation();
  const hasCapabilityForUser = (capability: Capability): boolean =>
    hasCapability(user?.role, capability);

  return {
    // 当前用户信息
    user,

    // 基础权限检查
    hasPermission,
    hasCapability: hasCapabilityForUser,
    canWrite: hasCapabilityForUser('writeData'),
    canUseReaderPost: hasCapabilityForUser('readerPost'),
    canManageUsers: hasCapabilityForUser('manageUsers'),

    /**
     * 是否为编辑用户
     */
    isEditor: () => hasPermission('editor'),

    /**
     * 是否为超级用户
     */
    isSuperuser: () => hasPermission('superuser'),

    /**
     * 是否为只读用户
     */
    isReader: () => user?.role === 'reader',

    /**
     * 检查是否可以执行写操作
     */
    canEdit: () => hasPermission('editor'),

    /**
     * 检查是否可以查看
     */
    canView: () => hasPermission('reader'),

    /**
     * 检查是否可以查看所有日志
     */
    canViewAllLogs: () => hasPermission('superuser'),

    /**
     * 权限相关的样式类
     *
     * @param requiredRole - 所需角色，默认为 'reader'
     * @returns CSS 类名
     */
    getPermissionClass: (requiredRole: Role = 'reader') => {
      return hasPermission(requiredRole) ? '' : 'permission-disabled';
    },

    /**
     * 权限相关的按钮属性
     *
     * @param requiredRole - 所需角色，默认为 'editor'
     * @returns 按钮属性对象
     */
    getButtonProps: (requiredRole: Role = 'editor'): ButtonProps => ({
      disabled: !hasPermission(requiredRole),
      title: hasPermission(requiredRole)
        ? ''
        : t('auth.permission.needPermission', {
            action:
              requiredRole === 'editor'
                ? t('common.edit')
                : t('auth.permission.view'),
          }),
    }),
  };
};

export default usePermissions;
