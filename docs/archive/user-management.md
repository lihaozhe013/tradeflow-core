# 用户管理功能方案

## 需求概述

在前端"高级"下拉菜单中新增"用户管理"页面，提供用户资料编辑和密码管理功能。

| 角色              | 权限范围                                                           |
| ----------------- | ------------------------------------------------------------------ |
| **reader/editor** | 只能编辑自己的显示名称和密码（需要旧密码验证）                     |
| **superuser**     | 可以查看所有用户、更改权限、删除用户、帮他们改密码（不需要旧密码） |

---

## 一、后端变更

### 1.1 修改 `backend/routes/users.ts`

**现有端点调整**：

| 端点                   | 方法   | 变更                                                 |
| ---------------------- | ------ | ---------------------------------------------------- |
| `/api/users`           | GET    | 权限从 `editor` 改为 `superuser`，添加分页参数       |
| `/api/users/:username` | PUT    | 权限从 `editor` 改为 `superuser`（用于编辑其他用户） |
| `/api/users/:username` | DELETE | 权限从 `editor` 改为 `superuser`                     |

**新增端点**：

| 端点                                  | 方法 | 描述                                 | 权限         |
| ------------------------------------- | ---- | ------------------------------------ | ------------ |
| `/api/users/me`                       | PUT  | 更新自己的显示名称                   | 所有登录用户 |
| `/api/users/me/password`              | PUT  | 修改自己的密码（需要旧密码）         | 所有登录用户 |
| `/api/users/:username/reset-password` | PUT  | 重置用户密码（superuser 指定新密码） | superuser    |

### 1.2 API 详细设计

**GET /api/users** — 查询参数：

```
?page=1&pageSize=20
```

响应：

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

**PUT /api/users/me** — 请求体：

```json
{
  "display_name": "新显示名称"
}
```

**PUT /api/users/me/password** — 请求体：

```json
{
  "oldPassword": "旧密码",
  "newPassword": "新密码"
}
```

**PUT /api/users/:username/reset-password** — 请求体：

```json
{
  "newPassword": "临时密码"
}
```

---

## 二、前端变更

### 2.1 新增 `frontend/src/pages/Users/index.tsx`

页面分为两个区域：

**区域一：我的资料（所有角色可见）**

- 显示名称编辑框 + 保存按钮
- 修改密码表单（旧密码、新密码、确认密码）+ 修改密码按钮

**区域二：用户列表（仅 superuser 可见）**

- 分页表格，列：用户名、显示名称、角色、启用状态、操作
- 操作列：
  - 编辑（弹窗编辑显示名称和角色）
  - 重置密码（弹窗输入新密码）
  - 删除（确认对话框）

### 2.2 修改 `frontend/src/App.tsx`

- 在"高级"下拉菜单中添加"用户管理"菜单项
- 添加 `/users` 路由

### 2.3 i18n 国际化

添加中/英/韩三语言支持

---

## 三、权限矩阵

| 功能                       | reader | editor | superuser |
| -------------------------- | ------ | ------ | --------- |
| 编辑自己的显示名称         | ✅     | ✅     | ✅        |
| 修改自己的密码（需旧密码） | ✅     | ✅     | ✅        |
| 查看用户列表               | ❌     | ❌     | ✅        |
| 编辑其他用户显示名称/角色  | ❌     | ❌     | ✅        |
| 重置用户密码               | ❌     | ❌     | ✅        |
| 删除用户                   | ❌     | ❌     | ✅        |

---

## 四、文件变更清单

| 操作 | 文件路径                                  |
| ---- | ----------------------------------------- |
| 修改 | `backend/routes/users.ts`                 |
| 新增 | `frontend/src/pages/Users/index.tsx`      |
| 修改 | `frontend/src/App.tsx`                    |
| 修改 | `frontend/src/i18n/locales/zh/zh-CN.json` |
| 修改 | `frontend/src/i18n/locales/en/en-US.json` |
| 修改 | `frontend/src/i18n/locales/ko/ko-Kr.json` |
