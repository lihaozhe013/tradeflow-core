import { useState, useCallback, useEffect } from 'react';
import { useMemo } from 'react';
import { Card, Select, Statistic, Row, Col, Spin, Alert, Typography } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  InboxOutlined,
  StockOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';

const { Text } = Typography;
const { Option } = Select;

/**
 * 本月库存变化量组件
 * 用户可以选择产品，查看该产品本月的库存变化信息
 */
type MonthlyInventoryChangeData = {
  product_model: string;
  month_start_inventory: number;
  current_inventory: number;
  monthly_change: number;
  query_date: string;
};

type MonthlyInventoryChangeResponse = {
  success: boolean;
  data?: MonthlyInventoryChangeData;
  message?: string;
  error?: string;
};

const MonthlyInventoryChange = () => {
  const { t } = useTranslation();
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [inventoryData, setInventoryData] = useState<MonthlyInventoryChangeData | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const { get } = useSimpleApi();

  // 使用useSimpleApiData获取产品列表
  type Product = { product_model: string };
  type ProductsResponse = { data?: Product[] };
  const {
    data: productsResponse,
    loading: productsLoading,
    error: productsError,
  } = useSimpleApiData<ProductsResponse>('/products');

  const products = useMemo(() => productsResponse?.data ?? [], [productsResponse]);

  // 当产品列表加载完成时，自动选择第一个产品
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0]?.product_model ?? null);
    }
  }, [products, selectedProduct]);

  // 获取月度库存变化数据
  const fetchMonthlyInventoryChange = useCallback(
    async (productModel: string) => {
      try {
        setInventoryLoading(true);
        setInventoryError(null);

        const result = await get<MonthlyInventoryChangeResponse>(
          `/overview/monthly-inventory-change/${encodeURIComponent(productModel)}`,
        );

        if (result.success && result.data) {
          setInventoryData(result.data);
        } else {
          setInventoryData(null);
          setInventoryError(result.message ?? result.error ?? t('overview.inventoryChangeFailed'));
        }
      } catch (err) {
        console.error(t('overview.inventoryChangeFailed'), err);
        setInventoryError(t('overview.inventoryChangeFailed'));
      } finally {
        setInventoryLoading(false);
      }
    },
    [get, t],
  );

  // 当选择的产品改变时，获取库存变化数据
  const handleProductChange = useCallback((productModel: string) => {
    setSelectedProduct(productModel);
  }, []);

  // 当默认产品设置后，自动加载数据
  useEffect(() => {
    if (selectedProduct) {
      fetchMonthlyInventoryChange(selectedProduct);
    }
  }, [selectedProduct, fetchMonthlyInventoryChange]);

  // 计算变化趋势图标和颜色
  const getTrendIcon = (change: number) => {
    if (change > 0) {
      return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
    } else if (change < 0) {
      return <ArrowDownOutlined style={{ color: '#ff4d4f' }} />;
    }
    return <StockOutlined style={{ color: '#666' }} />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return '#52c41a';
    if (change < 0) return '#ff4d4f';
    return '#666';
  };

  const loading = productsLoading || inventoryLoading;
  const error = productsError ?? inventoryError;

  return (
    <Card
      title={t('overview.monthlyInventoryChange')}
      variant="outlined"
      style={{ borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', height: 370 }}
      extra={
        <Select
          value={selectedProduct}
          onChange={handleProductChange}
          style={{ width: 200 }}
          placeholder={t('overview.selectProduct')}
          showSearch
          filterOption={(input, option) =>
            String(option?.children ?? '')
              .toLowerCase()
              .includes(input.toLowerCase())
          }
        >
          {products.map((product) => (
            <Option key={product.product_model} value={product.product_model}>
              {product.product_model}
            </Option>
          ))}
        </Select>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: '8px' }}>
            <Text type="secondary">{t('overview.loadingInventory')}</Text>
          </div>
        </div>
      ) : error ? (
        <Alert
          message={t('overview.dataLoadFailed')}
          description={error}
          type="error"
          showIcon
          style={{ margin: '10px 0' }}
        />
      ) : inventoryData ? (
        <Row gutter={[8, 8]}>
          <Col span={24}>
            <Statistic
              title={t('overview.monthStartInventory')}
              value={inventoryData.month_start_inventory || 0}
              prefix={<InboxOutlined />}
              valueStyle={{ color: '#1677ff', fontSize: '16px' }}
            />
          </Col>
          <Col span={24}>
            <Statistic
              title={t('overview.currentInventory')}
              value={inventoryData.current_inventory || 0}
              prefix={<StockOutlined />}
              valueStyle={{ color: '#722ed1', fontSize: '16px' }}
            />
          </Col>
          <Col span={24}>
            <Statistic
              title={t('overview.monthlyChange')}
              value={Math.abs(inventoryData.monthly_change || 0)}
              prefix={getTrendIcon(inventoryData.monthly_change)}
              suffix={
                inventoryData.monthly_change > 0
                  ? t('overview.increase')
                  : inventoryData.monthly_change < 0
                    ? t('overview.decrease')
                    : t('overview.noChange')
              }
              valueStyle={{ color: getTrendColor(inventoryData.monthly_change), fontSize: '16px' }}
            />
          </Col>
        </Row>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Text type="secondary">{t('overview.selectProductToView')}</Text>
        </div>
      )}
    </Card>
  );
};

export default MonthlyInventoryChange;
