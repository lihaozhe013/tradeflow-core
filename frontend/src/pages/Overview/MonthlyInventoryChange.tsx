import { useState } from 'react';
import { Card, Select, Statistic, Row, Col, Typography } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  InboxOutlined,
  StockOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MonthlyInventoryChangeData } from './types';

const { Text } = Typography;
const { Option } = Select;

const MonthlyInventoryChange = ({
  changes
}: {
  changes: Record<string, MonthlyInventoryChangeData>;
}) => {
  const { t } = useTranslation();
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const products = Object.keys(changes);
  const resolvedProduct =
    selectedProduct && Object.hasOwn(changes, selectedProduct)
      ? selectedProduct
      : (products[0] ?? null);
  const inventoryData = resolvedProduct ? changes[resolvedProduct] : null;

  // Show the direction of the saved monthly change.
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

  return (
    <Card
      title={t('overview.monthlyInventoryChange')}
      variant="outlined"
      extra={
        <Select
          value={resolvedProduct}
          onChange={setSelectedProduct}
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
            <Option key={product} value={product}>
              {product}
            </Option>
          ))}
        </Select>
      }
    >
      {inventoryData ? (
        <Row gutter={[8, 8]}>
          <Col span={24}>
            <Statistic
              title={t('overview.monthStartInventory')}
              value={inventoryData.month_start_inventory || 0}
              prefix={<InboxOutlined />}
              styles={{ content: { color: '#1677ff', fontSize: '16px' } }}
            />
          </Col>
          <Col span={24}>
            <Statistic
              title={t('overview.currentInventory')}
              value={inventoryData.current_inventory || 0}
              prefix={<StockOutlined />}
              styles={{ content: { color: '#722ed1', fontSize: '16px' } }}
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
              styles={{
                content: {
                  color: getTrendColor(inventoryData.monthly_change),
                  fontSize: '16px'
                }
              }}
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
