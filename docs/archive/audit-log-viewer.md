# 审计日志查看器方案

## 需求概述

为前端添加审计日志查看功能，允许用户查询 `system_logs` 表中的操作记录。

1. 前端：在 "export" 页面后添加 "高级" 下拉菜单，包含 "审计" 页面
2. 后端：新增 `superuser` 角色，拥有所有 `editor` 权限 + 查看所有人日志的权限
3. 普通用户只能查看自己的日志

---

## 一、后端变更

### 1.1 权限系统扩展

**修改 `backend/utils/auth.ts`**

在 `checkWritePermission` 函数中（第 295 行），将 `superuser` 与 `editor` 同等处理：

```typescript
if (req.user.role === 'editor' || req.user.role === 'superuser') {
  next();
  return;
}
```

**修改 `backend/types/express.d.ts`**

更新 `role` 字段的 JSDoc 注释，说明新增的 `superuser` 角色。

---

### 1.2 审计 API

**新增 `backend/routes/audit.ts`**

```
GET /api/audit/logs
```

**查询参数**：

| 参数        | 类型   | 描述                            |
| ----------- | ------ | ------------------------------- |
| `page`      | number | 页码，默认 1                    |
| `pageSize`  | number | 每页条数，默认 20               |
| `startDate` | string | 开始时间 (ISO 格式)             |
| `endDate`   | string | 结束时间 (ISO 格式)             |
| `username`  | string | 用户名过滤（仅 superuser 可用） |

**权限逻辑**：

- `superuser`：可查看所有日志，支持 `username` 参数过滤
- `editor`/`reader`：强制只能查看自己的日志（忽略 `username` 参数）

**响应格式**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "username": "admin",
        "action": "POST",
        "resource": "/api/inbound",
        "params": "...",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 1.3 注册路由

**修改 `backend/server.ts`**

- 导入 `audit` 路由
- 在 `/api/export` 之后添加 `app.use('/api/audit', auditRouter)`

---

## 二、前端变更

### 2.1 类型与权限更新

**修改 `frontend/src/auth/auth.types.ts`**

```typescript
export type Role = 'reader' | 'editor' | 'superuser';
```

**修改 `frontend/src/auth/usePermissions.ts`**

添加方法：

- `isSuperuser()` — 检查是否为 superuser
- `canViewAllLogs()` — 检查是否可以查看所有日志

---

### 2.2 菜单与路由

**修改 `frontend/src/App.tsx`**

1. 添加 `SettingOutlined` 图标导入
2. 添加 Audit 页面导入
3. 在 `menuItems` 中，`export` 之后添加下拉菜单：

```tsx
{
  key: 'advanced',
  label: t('nav.advanced'),
  icon: <SettingOutlined />,
  children: [
    {
      key: 'audit',
      label: <Link to="/audit">{t('nav.audit')}</Link>,
    },
  ],
}
```

4. 更新 `getSelectedKey()` 函数，添加 `/audit` 路径映射
5. 添加路由 `<Route path="/audit" element={<Audit />} />`

---

### 2.3 审计页面

**新增 `frontend/src/pages/Audit/index.tsx`**

页面结构：

```
┌─────────────────────────────────────────────────────────┐
│  审计日志                                                  │
├─────────────────────────────────────────────────────────┤
│  [用户名输入框] (仅 superuser 可见)  [时间范围选择器]  [查询] │
├─────────────────────────────────────────────────────────┤
│  表格：                                                   │
│  │ 时间 │ 用户名 │ 操作类型 │ 请求路径 │ 请求参数 │           │
│  │ ...  │ ...   │ POST   │ /api/xx │ {...}   │           │
├─────────────────────────────────────────────────────────┤
│  分页： < 1 2 3 ... 10 >                                  │
└─────────────────────────────────────────────────────────┘
```

**使用组件**：

- `Table` — Ant Design 表格
- `DatePicker.RangePicker` — 时间范围选择
- `Input` — 用户名搜索（仅 superuser 可见）
- `Button` — 查询按钮

**API 调用**：使用 `useApi` hook 的 `get` 方法调用 `/api/audit/logs`

---

## 三、权限层级

| 角色        | 读取 | 写入 | 查看自己日志 | 查看所有人日志 |
| ----------- | ---- | ---- | ------------ | -------------- |
| `reader`    | ✅   | ❌   | ✅           | ❌             |
| `editor`    | ✅   | ✅   | ✅           | ❌             |
| `superuser` | ✅   | ✅   | ✅           | ✅             |

---

## 四、i18n 国际化

**修改语言文件**（zh-CN.json, en-US.json, ko-KR.json）：

```json
{
  "nav": {
    "advanced": "高级",
    "audit": "审计日志"
  },
  "audit": {
    "title": "审计日志",
    "username": "用户名",
    "action": "操作类型",
    "resource": "请求路径",
    "params": "请求参数",
    "createdAt": "操作时间",
    "searchUser": "按用户名搜索",
    "search": "查询",
    "noData": "暂无日志记录"
  }
}
```

---

## 五、文件变更清单

| 操作 | 文件路径                                  |
| ---- | ----------------------------------------- |
| 修改 | `backend/utils/auth.ts`                   |
| 新增 | `backend/routes/audit.ts`                 |
| 修改 | `backend/server.ts`                       |
| 修改 | `frontend/src/auth/auth.types.ts`         |
| 修改 | `frontend/src/auth/usePermissions.ts`     |
| 修改 | `frontend/src/App.tsx`                    |
| 新增 | `frontend/src/pages/Audit/index.tsx`      |
| 修改 | `frontend/src/i18n/locales/zh/zh-CN.json` |
| 修改 | `frontend/src/i18n/locales/en/en-US.json` |
| 修改 | `frontend/src/i18n/locales/ko/ko-KR.json` |

---

## 六、未来扩展

当需要给 SUPERUSER 添加更多专属页面时，只需：

1. 在 `menuItems` 的 `advanced.children` 数组中添加新项
2. 在路由中添加对应路径
3. 在页面中使用 `isSuperuser()` 进行权限控制
