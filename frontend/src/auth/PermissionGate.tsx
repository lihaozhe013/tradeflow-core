import type { ReactNode } from 'react';
import { usePermissions } from '@/auth/usePermissions';
import type { Capability } from '@/auth/permissions';

interface PermissionGateProps {
  readonly capability: Capability;
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

const PermissionGate = ({
  capability,
  children,
  fallback = null
}: PermissionGateProps): ReactNode => {
  const { hasCapability } = usePermissions();

  return hasCapability(capability) ? children : fallback;
};

export default PermissionGate;
