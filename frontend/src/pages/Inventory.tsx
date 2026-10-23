import ExportButton from '@/components/ExportButton';
import { useSearchParams } from 'react-router-dom';
import { useRuntimeConfig } from '@/config/runtime';
import ResponsiveTable from '@/components/ResponsiveTable';
import PageHeader from '@/components/page/PageHeader';
import PageListBar from '@/components/page/PageListBar';
import { useState, useCallback, useEffect, useMemo, type ChangeEvent, type FC } from 'react';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { Input, Button, message, Tag } from 'antd';
import { DatabaseOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';
import { usePermissions } from '@/auth/usePermissions';

type InventoryStatusColor = 'green' | 'orange' | 'red';

type InventoryItem = {
  readonly product_model?: string;
  readonly current_inventory?: number;
};

type PaginationInfo = {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
};

type InventoryResponse = {
  readonly data: InventoryItem[];
  readonly pagination?: PaginationInfo;
};

type TotalCostResponse = {
  readonly total_cost_estimate: number;
};

const DEFAULT_PAGINATION: PaginationInfo = {
  current: 1,
  pageSize: 20,
  total: 0
};

const Inventory: FC = () => {
  const [entryParams] = useSearchParams();
  const [productFilter, setProductFilter] = useState(() => entryParams.get('product_model') ?? '');
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const { t } = useTranslation();
  const { currency_unit_symbol } = useRuntimeConfig();
  const { canWrite, hasPermission } = usePermissions();
  const [exportKeys, setExportKeys] = useState<(string | number)[]>([]);
  useEffect(() => {
    setExportKeys([]);
  }, [productFilter]);

  const { post, loading: actionLoading } = useSimpleApi();

  const { current } = pagination;

  const buildInventoryUrl = useCallback(() => {
    const params = new URLSearchParams({
      page: current.toString()
    });

    if (productFilter) {
      params.append('product_model', productFilter);
    }

    return `/inventory?${params.toString()}`;
  }, [current, productFilter]);

  const {
    data: inventoryResponse,
    loading,
    refetch: refreshInventory
  } = useSimpleApiData<InventoryResponse>(buildInventoryUrl(), {
    data: [],
    pagination: DEFAULT_PAGINATION
  });

  const { data: totalCostResponse, refetch: refreshTotalCost } =
    useSimpleApiData<TotalCostResponse>('/inventory/total-cost-estimate', {
      total_cost_estimate: 0
    });

  const inventoryData = useMemo<InventoryItem[]>(() => {
    return inventoryResponse?.data ?? [];
  }, [inventoryResponse?.data]);

  const totalCostEstimate = totalCostResponse?.total_cost_estimate ?? 0;

  /* useEffect removed to avoid setState in effect loop
  useEffect(() => {
    if (!inventoryResponse?.pagination) {
      return;
    }

    setPagination((prev) => ({
      current: inventoryResponse.pagination?.current ?? prev.current,
      pageSize: inventoryResponse.pagination?.pageSize ?? prev.pageSize,
      total: inventoryResponse.pagination?.total ?? prev.total,
    }));
  }, [inventoryResponse]);
  */

  const handleRefreshCache = async (): Promise<void> => {
    if (!canWrite) return;
    await post('/inventory/refresh', {});
    message.success(t('inventory.recalculated'));
    refreshInventory();
    refreshTotalCost();
  };

  const handleProductFilterChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { value } = event.target;
    setProductFilter(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleTableChange: TableProps<InventoryItem>['onChange'] = (paginationConfig) => {
    setPagination((prev) => ({
      ...prev,
      current: paginationConfig.current ?? prev.current
    }));
  };

  const inventoryColumns: ColumnsType<InventoryItem> = [
    {
      title: t('inventory.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 200,
      sorter: (a, b) => (a.product_model ?? '').localeCompare(b.product_model ?? '')
    },
    {
      title: t('inventory.currentInventory'),
      dataIndex: 'current_inventory',
      key: 'current_inventory',
      width: 120,
      sorter: (a, b) => (a.current_inventory ?? 0) - (b.current_inventory ?? 0),
      render: (quantity) => {
        const value = quantity ?? 0;
        let color: InventoryStatusColor = 'green';
        if (value === 0) {
          color = 'red';
        } else if (value < 10) {
          color = 'orange';
        }
        return <Tag color={color}>{value}</Tag>;
      }
    },
    {
      title: t('inventory.status'),
      key: 'inventory_status',
      width: 100,
      render: (_, record) => {
        const quantity = record.current_inventory ?? 0;

        if (quantity === 0) {
          return <Tag color="red">{t('inventory.outOfStock')}</Tag>;
        }

        if (quantity < 10) {
          return <Tag color="orange">{t('inventory.lowInventory')}</Tag>;
        }

        return <Tag color="green">{t('inventory.normal')}</Tag>;
      }
    }
  ];

  return (
    <div className="page tone-green">
      <PageHeader
        eyebrow={t('nav.masterData')}
        title={t('inventory.title')}
        description={t('inventory.subtitle')}
        icon={<DatabaseOutlined />}
        actions={
          <>
            {hasPermission('editor') && (
              <ExportButton
                size="large"
                disabled={loading}
                context={{
                  source: 'inventory',
                  filters: { product_model: productFilter || undefined },
                  ids: exportKeys
                }}
              />
            )}
            {canWrite && (
              <Button
                size="large"
                type="primary"
                icon={<ReloadOutlined spin={actionLoading} />}
                onClick={handleRefreshCache}
                loading={actionLoading}
              >
                {t('inventory.recalculate')}
              </Button>
            )}
          </>
        }
      />

      <section className="page-card">
        <div className="page-toolbar">
          <div className="page-toolbar-row">
            <div className="page-toolbar-search" style={{ maxWidth: 420 }}>
              <Input
                placeholder={t('inventory.searchProductModel')}
                prefix={<SearchOutlined />}
                value={productFilter}
                onChange={handleProductFilterChange}
                allowClear
                aria-label={t('inventory.searchProductModel')}
              />
            </div>
            <div className="page-toolbar-actions">
              <span className="page-summary-label">{t('inventory.totalCostEstimate')}</span>
              <span className="page-summary-value">
                {currency_unit_symbol}
                {totalCostEstimate.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
          </div>
        </div>

        <PageListBar
          total={inventoryResponse?.pagination?.total ?? 0}
          selectedCount={exportKeys.length}
          onClearSelection={() => setExportKeys([])}
        />

        <ResponsiveTable<InventoryItem>
          columns={inventoryColumns}
          dataSource={inventoryData}
          rowKey="product_model"
          rowSelection={
            hasPermission('editor')
              ? {
                  selectedRowKeys: exportKeys,
                  preserveSelectedRowKeys: true,
                  onChange: (keys) => setExportKeys(keys.map(String))
                }
              : undefined
          }
          loading={loading}
          onChange={handleTableChange}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: inventoryResponse?.pagination?.total ?? 0,
            showQuickJumper: true,
            showTotal: (total, range) =>
              t('inventory.paginationTotal', {
                start: range[0],
                end: range[1],
                total
              })
          }}
          scroll={{ x: 600 }}
        />
      </section>
    </div>
  );
};

export default Inventory;
