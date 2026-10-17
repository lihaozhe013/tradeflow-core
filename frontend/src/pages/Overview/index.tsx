import { useState, useCallback, useEffect, useRef } from 'react';
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
import { apiRequest, RequestError } from '@/utils/request';
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
  const navigate = useNavigate();
  const [stats, setStats] = useState<OverviewStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const refreshPending = useRef(false);

  useEffect(() => {
    const version = ++requestVersion.current;
    apiRequest<OverviewStatsResponse>('/overview/stats')
      .then((result) => {
        if (version === requestVersion.current) setStats(result);
      })
      .catch((err: unknown) => {
        if (version !== requestVersion.current) return;
        if (
          err instanceof RequestError &&
          (err.data as { code?: string })?.code === 'SNAPSHOT_NOT_READY'
        ) {
          setNotReady(true);
        } else {
          setError('snapshot.loadFailed');
        }
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => {
      requestVersion.current++;
    };
  }, []);

  const refreshStats = useCallback(async () => {
    if (!canUseReaderPost || refreshPending.current) return;
    refreshPending.current = true;
    const version = ++requestVersion.current;
    setRefreshing(true);
    setError(null);
    try {
      const result = await apiRequest<OverviewStatsResponse>('/overview/stats', {
        method: 'POST',
        body: {}
      });
      if (version !== requestVersion.current) return;
      setStats(result);
      setNotReady(false);
    } catch (err) {
      if (version === requestVersion.current) {
        setError(
          err instanceof RequestError && err.status === 409
            ? 'snapshot.refreshConflict'
            : 'snapshot.refreshFailed'
        );
      }
    } finally {
      refreshPending.current = false;
      if (version === requestVersion.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [canUseReaderPost]);

  // Keep the last successful result visible during a refresh.
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

  // Calculate margin using the saved cost of sold goods.
  const calculateProfitMargin = () => {
    const soldGoodsCost = overview.sold_goods_cost ?? 0;
    const sales = overview.total_sales_amount ?? 0;
    if (sales === 0) return '0.00';
    return (((sales - soldGoodsCost) / sales) * 100).toFixed(2);
  };

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
              loading={refreshing}
              disabled={loading}
              size="large"
            >
              {t('overview.refreshData')}
            </Button>
          )}
        </Space>
      </div>

      {loading && <Spin />}
      {notReady && <Alert type="info" showIcon title={t('snapshot.notReady')} />}
      {error && <Alert type="error" showIcon title={t(error)} />}
      {stats?.last_updated && (
        <Text type="secondary">
          {t('snapshot.lastUpdated', { time: new Date(stats.last_updated).toLocaleString() })}
        </Text>
      )}
      {stats && (
        <div className="overview-layout">
          <div className="overview-sales-column">
            <TopSalesPieChart records={resolvedStats.top_sales_products} />
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
                        styles={{ content: { color: '#3f8600' } }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title={t('overview.totalCost')}
                        value={overview.sold_goods_cost}
                        prefix={<ShoppingCartOutlined />}
                        styles={{ content: { color: '#fa8c16' } }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title={t('overview.profitMargin')}
                        value={calculateProfitMargin()}
                        suffix="%"
                        prefix={<RiseOutlined />}
                        styles={{ content: { color: '#3f8600' } }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title={t('overview.totalPurchase')}
                        value={overview.total_purchase_amount}
                        prefix={<ShoppingCartOutlined />}
                        styles={{ content: { color: '#1677ff' } }}
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
                <MonthlyInventoryChange changes={resolvedStats.monthly_inventory_changes} />
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
      )}
    </div>
  );
};

export default OverviewMain;
