# 审计日志筛选增强方案

## 需求概述

在现有按时间 + 用户名筛选的基础上，新增两个互相独立的模糊搜索维度：

- **请求路径** → 对应 `system_logs.resource`（`req.originalUrl`，例
  `/api/inbound?product_code=A001`）
- **请求参数** → 对应
  `system_logs.params`（已脱敏的 JSON 字符串，对整段做 substring 匹配）

约束：

- 大小写不敏感（依赖 PostgreSQL `ILIKE`）
- 全部角色可用，非 superuser 仍受现有 `username` 强制约束
- 沿用现有「查询」按钮 + 回车快捷键触发方式
- 无数据库 migration、无新增依赖

---

## 一、Backend 变更

### 1.1 `backend/routes/audit.ts`

在 `req.query` 解构中新增 `resource` 与 `params`，在已有 `where` 对象中追加
`contains` + `mode: 'insensitive'` 过滤条件。

```ts
const { page, pageSize, startDate, endDate, username, resource, params } =
  req.query;

// ...existing username / created_at filter logic...

if (typeof resource === 'string' && resource.trim()) {
  where.resource = { contains: resource.trim(), mode: 'insensitive' };
}
if (typeof params === 'string' && params.trim()) {
  where.params = { contains: params.trim(), mode: 'insensitive' };
}
```

权限逻辑、响应结构、排序、分页均不变。

---

## 二、Frontend 变更

### 2.1 `frontend/src/pages/Audit/index.tsx`

**新增 state：**

```ts
const [resourceFilter, setResourceFilter] = useState('');
const [paramsFilter, setParamsFilter] = useState('');
```

**Toolbar 中插入两个 `<Input>`：**

- 占位文案分别使用 i18n key `audit.searchResource` 与 `audit.searchParams`
- 宽度 200
- `onPressEnter={handleSearch}` 复用快捷键

**`fetchData` 中追加 query 参数：**

```ts
if (resourceFilter.trim()) {
  params.append('resource', resourceFilter.trim());
}
if (paramsFilter.trim()) {
  params.append('params', paramsFilter.trim());
}
```

**`handleReset` 中清空新 state：**

```ts
setResourceFilter('');
setParamsFilter('');
```

**`useCallback` 依赖数组追加 `resourceFilter`、`paramsFilter`。**

`SystemLog` 类型无需变更。

### 2.2 i18n 新增 key

| key                    | zh-CN          | en-US              | ko-KR                |
| ---------------------- | -------------- | ------------------ | -------------------- |
| `audit.searchResource` | 按请求路径搜索 | Search by resource | 요청 경로로 검색     |
| `audit.searchParams`   | 按请求参数搜索 | Search by params   | 요청 매개변수로 검색 |

---

## 三、文件变更清单

| 操作 | 文件                                      |
| ---- | ----------------------------------------- |
| 修改 | `backend/routes/audit.ts`                 |
| 修改 | `frontend/src/pages/Audit/index.tsx`      |
| 修改 | `frontend/src/i18n/locales/zh/zh-CN.json` |
| 修改 | `frontend/src/i18n/locales/en/en-US.json` |
| 修改 | `frontend/src/i18n/locales/ko/ko-Kr.json` |

---

## 四、验证步骤

```sh
cd backend && pnpm lint       # 零错误
cd frontend && pnpm type-check # 零错误
pnpm format                   # 仓库根目录
```

手动 smoke test：

1. superuser：路径、参数单独筛、组合筛都能正确返回
2. non-superuser：`username` 被强制锁定，路径/参数仍能进一步缩窄
3. 输入框回车 = 点击「查询」
4. 「重置」清空所有 4 个条件并回到第 1 页
5. 空字符串不传 query 参数

---

## 五、范围外 / 未来扩展

- 数据库索引：`resource` / `params` 当前无索引，`ILIKE` 在大数据量下慢，可后续加
  `pg_trgm` + GIN
- 解析 JSON 后按 `key=value` 结构化搜索（需 JSONB 化）
- 把 `statusCode` / IP 也写进日志表（schema 变更）
- debounce 自动触发搜索
