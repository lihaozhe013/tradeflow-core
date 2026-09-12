# API Catalog

Base URL: `/api` Auth: JWT via `POST /api/auth/login` → `Authorization: Bearer <token>` (except
`/api/auth/*`)

## Auth

| Method | Path               | Auth | Source         |
| ------ | ------------------ | ---- | -------------- |
| POST   | `/api/auth/login`  | -    | routes/auth.ts |
| GET    | `/api/auth/me`     | yes  | routes/auth.ts |
| POST   | `/api/auth/logout` | yes  | routes/auth.ts |

## About

| Method | Path         | Auth | Source          |
| ------ | ------------ | ---- | --------------- |
| GET    | `/api/about` | yes  | routes/about.ts |

## Overview

| Method | Path                                                   | Auth                  | Source             |
| ------ | ------------------------------------------------------ | --------------------- | ------------------ |
| GET    | `/api/overview/stats`                                  | editor/superuser only | routes/overview.ts |
| POST   | `/api/overview/stats`                                  | editor/superuser only | routes/overview.ts |
| GET    | `/api/overview/top-sales-products`                     | editor/superuser only | routes/overview.ts |
| GET    | `/api/overview/monthly-inventory-change/:productModel` | editor/superuser only | routes/overview.ts |

## Inventory

| Method | Path                                 | Auth | Source              |
| ------ | ------------------------------------ | ---- | ------------------- |
| GET    | `/api/inventory`                     | yes  | routes/inventory.ts |
| GET    | `/api/inventory/total-cost-estimate` | yes  | routes/inventory.ts |
| POST   | `/api/inventory/refresh`             | yes  | routes/inventory.ts |

## Inbound

| Method | Path                 | Auth | Source            |
| ------ | -------------------- | ---- | ----------------- |
| GET    | `/api/inbound`       | yes  | routes/inbound.ts |
| POST   | `/api/inbound`       | yes  | routes/inbound.ts |
| PUT    | `/api/inbound/:id`   | yes  | routes/inbound.ts |
| DELETE | `/api/inbound/:id`   | yes  | routes/inbound.ts |
| POST   | `/api/inbound/batch` | yes  | routes/inbound.ts |

## Outbound

| Method | Path                  | Auth | Source             |
| ------ | --------------------- | ---- | ------------------ |
| GET    | `/api/outbound`       | yes  | routes/outbound.ts |
| POST   | `/api/outbound`       | yes  | routes/outbound.ts |
| PUT    | `/api/outbound/:id`   | yes  | routes/outbound.ts |
| DELETE | `/api/outbound/:id`   | yes  | routes/outbound.ts |
| POST   | `/api/outbound/batch` | yes  | routes/outbound.ts |

## Partners

| Method | Path                        | Auth | Source             |
| ------ | --------------------------- | ---- | ------------------ |
| GET    | `/api/partners`             | yes  | routes/partners.ts |
| POST   | `/api/partners`             | yes  | routes/partners.ts |
| PUT    | `/api/partners/:short_name` | yes  | routes/partners.ts |
| DELETE | `/api/partners/:short_name` | yes  | routes/partners.ts |
| POST   | `/api/partners/bindings`    | yes  | routes/partners.ts |

## Products

| Method | Path                     | Auth | Source             |
| ------ | ------------------------ | ---- | ------------------ |
| GET    | `/api/products`          | yes  | routes/products.ts |
| POST   | `/api/products`          | yes  | routes/products.ts |
| PUT    | `/api/products/:code`    | yes  | routes/products.ts |
| DELETE | `/api/products/:code`    | yes  | routes/products.ts |
| POST   | `/api/products/bindings` | yes  | routes/products.ts |

## Product Prices

| Method | Path                          | Auth | Source                  |
| ------ | ----------------------------- | ---- | ----------------------- |
| GET    | `/api/product-prices`         | yes  | routes/productPrices.ts |
| POST   | `/api/product-prices`         | yes  | routes/productPrices.ts |
| PUT    | `/api/product-prices/:id`     | yes  | routes/productPrices.ts |
| DELETE | `/api/product-prices/:id`     | yes  | routes/productPrices.ts |
| GET    | `/api/product-prices/current` | yes  | routes/productPrices.ts |
| GET    | `/api/product-prices/auto`    | yes  | routes/productPrices.ts |

## Receivable

| Method | Path                                              | Auth                  | Source               |
| ------ | ------------------------------------------------- | --------------------- | -------------------- |
| GET    | `/api/receivable`                                 | editor/superuser only | routes/receivable.ts |
| GET    | `/api/receivable/payments/:customer_code`         | editor/superuser only | routes/receivable.ts |
| POST   | `/api/receivable/payments`                        | editor/superuser only | routes/receivable.ts |
| PUT    | `/api/receivable/payments/:id`                    | editor/superuser only | routes/receivable.ts |
| DELETE | `/api/receivable/payments/:id`                    | editor/superuser only | routes/receivable.ts |
| GET    | `/api/receivable/details/:customer_code`          | editor/superuser only | routes/receivable.ts |
| GET    | `/api/receivable/uninvoiced/:customer_code`       | editor/superuser only | routes/receivable.ts |
| GET    | `/api/receivable/invoiced/:customer_code`         | editor/superuser only | routes/receivable.ts |
| POST   | `/api/receivable/invoices/refresh/:customer_code` | editor/superuser only | routes/receivable.ts |

## Payable

| Method | Path                                           | Auth                  | Source            |
| ------ | ---------------------------------------------- | --------------------- | ----------------- |
| GET    | `/api/payable`                                 | editor/superuser only | routes/payable.ts |
| GET    | `/api/payable/payments/:supplier_code`         | editor/superuser only | routes/payable.ts |
| POST   | `/api/payable/payments`                        | editor/superuser only | routes/payable.ts |
| PUT    | `/api/payable/payments/:id`                    | editor/superuser only | routes/payable.ts |
| DELETE | `/api/payable/payments/:id`                    | editor/superuser only | routes/payable.ts |
| GET    | `/api/payable/details/:supplier_code`          | editor/superuser only | routes/payable.ts |
| GET    | `/api/payable/uninvoiced/:supplier_code`       | editor/superuser only | routes/payable.ts |
| GET    | `/api/payable/invoiced/:supplier_code`         | editor/superuser only | routes/payable.ts |
| POST   | `/api/payable/invoices/refresh/:supplier_code` | editor/superuser only | routes/payable.ts |

## Users

| Method | Path                                  | Auth                   | Source          |
| ------ | ------------------------------------- | ---------------------- | --------------- |
| POST   | `/api/users`                          | superuser only         | routes/users.ts |
| PUT    | `/api/users/me`                       | any authenticated user | routes/users.ts |
| PUT    | `/api/users/me/password`              | any authenticated user | routes/users.ts |
| GET    | `/api/users`                          | superuser only         | routes/users.ts |
| PUT    | `/api/users/:username`                | superuser only         | routes/users.ts |
| PUT    | `/api/users/:username/reset-password` | superuser only         | routes/users.ts |
| DELETE | `/api/users/:username`                | superuser only         | routes/users.ts |

## Audit

| Method | Path              | Auth                    | Source          |
| ------ | ----------------- | ----------------------- | --------------- |
| GET    | `/api/audit/logs` | yes (self or superuser) | routes/audit.ts |

## Analysis

| Method | Path                           | Auth                  | Source                      |
| ------ | ------------------------------ | --------------------- | --------------------------- |
| GET    | `/api/analysis/data`           | editor/superuser only | routes/analysis/analysis.ts |
| GET    | `/api/analysis/detail`         | editor/superuser only | routes/analysis/analysis.ts |
| GET    | `/api/analysis/filter-options` | editor/superuser only | routes/analysis/analysis.ts |

## Export

| Method | Path                             | Auth                  | Source                 |
| ------ | -------------------------------- | --------------------- | ---------------------- |
| POST   | `/api/export/base-info`          | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/inbound-outbound`   | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/statement`          | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/receivable-payable` | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/invoice`            | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/analysis`           | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/advanced-analysis`  | editor/superuser only | routes/export/index.ts |
| POST   | `/api/export/inventory`          | editor/superuser only | routes/export/index.ts |
| GET    | `/api/export/status`             | editor/superuser only | routes/export/index.ts |
