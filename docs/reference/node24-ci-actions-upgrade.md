# CI Node.js 24 Actions Upgrade Plan

## Objective

Update the `build-and-push` GitHub Actions workflow so every third-party action
listed in the Node.js 20 deprecation warning runs on the Node.js 24 action
runtime.

## Scope

- Update `.github/workflows/build.yml` action references only.
- Keep the workflow's existing Node.js 24 project runtime, pnpm version, Docker
  image configuration, trigger, and secrets unchanged.
- Use the Node.js 24-compatible patch version for `pnpm/action-setup`, because
  its `v4` major tag still resolves to a Node.js 20 action runtime.

## Compatibility updates

| Action                | Current reference               | Target reference                |
| --------------------- | ------------------------------- | ------------------------------- |
| Checkout              | `actions/checkout@v4`           | `actions/checkout@v5`           |
| Node.js setup         | `actions/setup-node@v4`         | `actions/setup-node@v5`         |
| pnpm setup            | `pnpm/action-setup@v4`          | `pnpm/action-setup@v4.4.0`      |
| QEMU setup            | `docker/setup-qemu-action@v3`   | `docker/setup-qemu-action@v4`   |
| Buildx setup          | `docker/setup-buildx-action@v3` | `docker/setup-buildx-action@v4` |
| Docker login          | `docker/login-action@v3`        | `docker/login-action@v4`        |
| Docker build and push | `docker/build-push-action@v6`   | `docker/build-push-action@v7`   |

## Validation

1. Check the workflow diff and whitespace.
2. Verify no deprecated action references remain in the workflow and all target
   action references are present.
3. Run Prettier's check against the changed YAML and plan files.
4. Commit the focused change with a Conventional Commit message.

## Non-goals

- Do not change application source code or dependencies.
- Do not archive this plan automatically; archive it only if explicitly
  requested later.
