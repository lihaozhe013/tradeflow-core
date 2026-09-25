import { useState, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Spin,
  Alert,
  Typography,
  Button,
  Space,
  Statistic,
  List,
  Avatar
} from 'antd';
import {
  ShoppingCartOutlined,
  RiseOutlined,
  DollarOutlined,
  SyncOutlined,
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';
import { usePermissions } from '@/auth/usePermissions';

import MonthlyInventoryChange from '@/pages/Overview/MonthlyInventoryChange';
import OutOfStockModal from '@/pages/Overview/OutOfStockModal';
import TopSalesPieChart from '@/pages/Overview/TopSalesPieChart';
import { DEFAULT_OVERVIEW_STATS } from '@/pages/Overview/types';
import type { OverviewStatsResponse } from '@/pages/Overview/types';

const { Title, Text } = Typography;

const OverviewMain = () => {
  const { t } = useTranslation();
  const { canWrite, canUseReaderPost } = usePermissions();
  const { post } = useSimpleApi();
  const navigate = useNavigate();

  // 使用简化版Hook获取统计数据
  const {
    data: stats,
    loading,
    error,
    refetch
  } = useSimpleApiData<OverviewStatsResponse>('/overview/stats', DEFAULT_OVERVIEW_STATS);

  // 刷新统计数据
  const refreshStats = useCallback(async () => {
    if (!canUseReaderPost) return;
    try {
      await post('/overview/stats', {});
      await refetch();
    } catch (err) {
      console.error('刷新统计数据失败:', err);
    }
  }, [canUseReaderPost, post, refetch]);

  // 处理数据格式，确保安全访问
  const resolvedStats = stats ?? DEFAULT_OVERVIEW_STATS;
  const overview = resolvedStats.overview ?? DEFAULT_OVERVIEW_STATS.overview;
  const outOfStockProducts = resolvedStats.out_of_inventory_products ?? [];
  const outOfStockCount = outOfStockProducts.length;
  const [modalVisible, setModalVisible] = useState(false);

  // Quick actions.
  const handleQuickInbound = () => {
    navigate('/inbound');
  };

  const handleQuickOutbound = () => {
    navigate('/outbound');
  };

  // 计算利润率（基于已售商品成本）
  const calculateProfitMargin = () => {
    const soldGoodsCost = overview.sold_goods_cost ?? 0;
    const sales = overview.total_sales_amount ?? 0;
    if (sales === 0) return '0.00';
    return (((sales - soldGoodsCost) / sales) * 100).toFixed(2);
  };

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #e9f5ff 100%)'
        }}
      >
        <Card
          style={{
            textAlign: 'center',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
          }}
        >
          <Spin size="large" />
          <p style={{ marginTop: '16px', color: '#666' }}>{t('overview.loading')}</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #e9f5ff 100%)'
        }}
      >
        <Alert
          message={t('overview.loadFailed')}
          description={error}
          type="error"
          showIcon
          style={{
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            maxWidth: '500px'
          }}
        />
      </div>
    );
  }

  return (
    <div className="overview-dashboard">
      <div className="overview-header">
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {t('overview.title')}
          </Title>
          <Text type="secondary">{t('overview.subtitle')}</Text>
        </div>
        <Space wrap className="overview-header-actions">
          {canWrite && (
            <>
              <Button
                type="primary"
                icon={<ImportOutlined />}
                onClick={handleQuickInbound}
                size="large"
              >
                {t('overview.quickInbound')}
              </Button>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                onClick={handleQuickOutbound}
                size="large"
              >
                {t('overview.quickOutbound')}
              </Button>
            </>
          )}
          {canUseReaderPost && (
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={refreshStats}
              loading={loading}
              size="large"
            >
              {t('overview.refreshData')}
            </Button>
          )}
        </Space>
      </div>

      <div className="overview-layout">
        <div className="overview-sales-column">
          <TopSalesPieChart />
        </div>

        <div className="overview-details-column">
          <div className="overview-summary-panel">
            <Card
              title={t('overview.overview')}
              variant="outlined"
              className="overview-summary-card"
            >
              <div>
                <Row gutter={[16, 16]}>
                  <Col xs={12} md={6}>
                    <Statistic
                      title={t('overview.totalSales')}
                      value={overview.total_sales_amount}
                      prefix={<DollarOutlined />}
                      valueStyle={{ color: '#3f8600' }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic
                      title={t('overview.totalCost')}
                      value={overview.sold_goods_cost}
                      prefix={<ShoppingCartOutlined />}
                      valueStyle={{ color: '#fa8c16' }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic
                      title={t('overview.profitMargin')}
                      value={calculateProfitMargin()}
                      suffix="%"
                      prefix={<RiseOutlined />}
                      valueStyle={{ color: '#3f8600' }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic
                      title={t('overview.totalPurchase')}
                      value={overview.total_purchase_amount}
                      prefix={<ShoppingCartOutlined />}
                      valueStyle={{ color: '#1677ff' }}
                    />
                  </Col>
                </Row>
              </div>
              <div className="overview-period-note">
                {t('overview.includesOnlyTheModtRecentYear')}
              </div>
            </Card>
          </div>

          <div className="overview-lower-panels">
            <div className="overview-lower-panel">
              <MonthlyInventoryChange />
            </div>
            <div className="overview-lower-panel">
              <Card
                title={<span style={{ fontWeight: 600 }}>{t('overview.inventoryStatus')}</span>}
                variant="outlined"
                className="overview-stock-card"
                styles={{
                  body: {
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column'
                  }
                }}
              >
                <div className="overview-stock-body">
                  <List
                    size="small"
                    dataSource={outOfStockProducts.slice(0, 5)}
                    locale={{ emptyText: t('overview.noOutOfStock') }}
                    renderItem={(item) => (
                      <List.Item style={{ padding: '4px 0', alignItems: 'center' }}>
                        <List.Item.Meta
                          avatar={
                            <Avatar
                              style={{
                                backgroundColor: '#e6f4ff',
                                color: '#1677ff',
                                fontWeight: 600
                              }}
                              size={24}
                            >
                              {item.product_model?.[0] ?? '?'}
                            </Avatar>
                          }
                          title={
                            <span style={{ fontSize: 14, color: '#333' }}>
                              {item.product_model}
                            </span>
                          }
                        />
                      </List.Item>
                    )}
                    style={{
                      marginBottom: 8,
                      maxHeight: 140,
                      overflow: 'hidden',
                      width: '100%',
                      background: 'none'
                    }}
                  />
                  {outOfStockCount > 5 && (
                    <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                      {t('overview.partialDisplay')}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: 8,
                      width: '100%'
                    }}
                  >
                    <Button type="primary" onClick={() => setModalVisible(true)}>
                      {t('overview.viewDetails')}
                    </Button>
                  </div>
                  <OutOfStockModal
                    visible={modalVisible}
                    onClose={() => setModalVisible(false)}
                    products={outOfStockProducts}
                  />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewMain;
