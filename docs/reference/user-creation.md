# Superuser User Creation

## Objective

Allow superusers to create new users from the existing user management page. The
backend remains the final authorization boundary, and the existing users table,
password hashing, and role model are reused.

## Implementation

- Add `POST /api/users` protected by `authorize(['superuser'])`.
- Accept `username`, `password`, optional `display_name`, optional `role`, and
  optional `enabled`; default the role to `reader` and enabled state to `true`.
- Validate usernames, passwords, roles, and enabled values before creating the
  record. Hash the password with the existing Argon2 helper and never return or
  log the password hash.
- Add a superuser-only create-user button and modal to the Users page with
  password confirmation and role/status controls.
- Add English, Chinese, and Korean translations and update the API catalog.

## Validation

- Verify successful creation for reader, editor, and superuser roles.
- Verify reader/editor requests are rejected with `403`.
- Verify invalid input returns `400` and duplicate usernames return `409`.
- Run backend lint and frontend type-check.

This document is not archived automatically.
