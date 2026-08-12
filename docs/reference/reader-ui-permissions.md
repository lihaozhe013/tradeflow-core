# Reader UI Permissions Refactor

## Objective

Prevent `reader` users from seeing business write controls while preserving
read-only workflows. The backend remains the final authorization boundary.

## Implementation

- Keep `AuthContext.user.role` as the single reactive source of the current
  role.
- Add a pure capability policy and a reusable `PermissionGate` under the
  frontend auth layer.
- Make `usePermissions`, route checks, and role helpers reuse the same policy.
- Block unauthorized reader write requests in the shared request layer before
  `fetch`.
- Hide business write controls and write-only table columns in all affected
  pages.
- Keep Audit available to readers and protect Users for `superuser` only.
- Preserve reader export/overview/analysis POST operations only when
  `auth.allowExportsForReader` is enabled.

## Validation

- Run `pnpm type-check` and `pnpm build` from `frontend/`.
- Verify reader, editor, and superuser UI behavior manually, including direct
  navigation to `/users`.
- Verify forbidden reader writes do not produce network requests.

This document is not archived automatically.
