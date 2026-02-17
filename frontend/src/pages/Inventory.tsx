import { useState, useCallback, useEffect, useMemo, type ChangeEvent, type FC } from 'react';
import type { ColumnsType, TableProps } from 'antd/es/table';
import {
  Table,
  Card,
  Typography,
  Row,
  Col,
  Input,
  Button,
  message,
  Space,
  Tag,
  Divider,
} from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';
import { currency_unit_symbol } from '@/config/types';

const { Title } = Typography;

type InventoryStatusColor = 'green' | 'orange' | 'red';

type InventoryItem = {
  readonly product_model?: string;
  readonly current_inventory?: number;
  readonly last_update?: string;
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
  total: 0,
};

const Inventory: FC = () => {
  const [productFilter, setProductFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const { t } = useTranslation();

  const { post, loading: actionLoading } = useSimpleApi();

  const buildInventoryUrl = useCallback(() => {
    const params = new URLSearchParams({
      page: pagination.current.toString(),
    });

    if (productFilter) {
      params.append('product_model', productFilter);
    }

    return `/inventory?${params.toString()}`;
  }, [pagination, productFilter]);

  const {
    data: inventoryResponse,
    loading,
    refetch: refreshInventory,
  } = useSimpleApiData<InventoryResponse>(buildInventoryUrl(), {
    data: [],
    pagination: DEFAULT_PAGINATION,
  });

  const { data: totalCostResponse, refetch: refreshTotalCost } =
    useSimpleApiData<TotalCostResponse>('/inventory/total-cost-estimate', {
      total_cost_estimate: 0,
    });

  const inventoryData = useMemo<InventoryItem[]>(() => {
    return inventoryResponse?.data ?? [];
  }, [inventoryResponse?.data]);

  const totalCostEstimate = totalCostResponse?.total_cost_estimate ?? 0;

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

  const handleRefreshCache = async (): Promise<void> => {
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
      current: paginationConfig.current ?? prev.current,
    }));
  };

  const inventoryColumns: ColumnsType<InventoryItem> = [
    {
      title: t('inventory.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 200,
      sorter: (a, b) => (a.product_model ?? '').localeCompare(b.product_model ?? ''),
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
      },
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
      },
    },
    {
      title: t('inventory.lastUpdate'),
      dataIndex: 'last_update',
      key: 'last_update',
      width: 180,
      sorter: (a, b) =>
        new Date(a.last_update ?? 0).getTime() - new Date(b.last_update ?? 0).getTime(),
    },
  ];

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t('inventory.title')}
            </Title>
          </Col>
          <Col>
            <Space>
              <Input
                placeholder={t('inventory.searchProductModel')}
                prefix={<SearchOutlined />}
                value={productFilter}
                onChange={handleProductFilterChange}
                style={{ width: 200 }}
                allowClear
              />
              <Button
                type="primary"
                icon={<ReloadOutlined spin={actionLoading} />}
                onClick={handleRefreshCache}
                loading={actionLoading}
              >
                {t('inventory.recalculate')}
              </Button>
            </Space>
          </Col>
        </Row>
        <Divider />

        <Row
          justify="space-between"
          align="middle"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #d9d9d9',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
          }}
        >
          <Col>
            <Space>
              <strong>{t('inventory.totalCostEstimate')}: </strong>
              <Tag color="blue" style={{ fontSize: '14px', padding: '4px 8px' }}>
                {currency_unit_symbol}
                {totalCostEstimate.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Tag>
            </Space>
          </Col>
        </Row>

        <div className="responsive-table">
          <Table<InventoryItem>
            columns={inventoryColumns}
            dataSource={inventoryData}
            rowKey="product_model"
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('inventory.paginationTotal', {
                  start: range[0],
                  end: range[1],
                  total,
                }),
            }}
            scroll={{ x: 600 }}
          />
        </div>
      </Card>
    </div>
  );
};

export default Inventory;
