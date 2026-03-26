import React from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { useTranslation } from 'react-i18next';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import type { AnalysisData, AnalysisType } from '@/types/analysis';

interface AnalysisStatisticsProps {
  data: AnalysisData | null;
  loading: boolean;
  analysisType: AnalysisType;
}

const AnalysisStatistics: React.FC<AnalysisStatisticsProps> = ({ data, loading, analysisType }) => {
  const { t } = useTranslation();

  if (!data) return null;

  if (analysisType === 'inbound') {
    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card loading={loading}>
            <Statistic
              title={t('analysis.purchaseAmount') || 'Total Purchase Amount'}
              value={data.purchase_amount ?? 0}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
      </Row>
    );
  }

  // Outbound
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading}>
          <Statistic
            title={t('analysis.salesAmount')}
            value={data.sales_amount ?? 0}
            precision={2}
            prefix="¥"
            valueStyle={{ color: (data.sales_amount ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading}>
          <Statistic
            title={t('analysis.costAmount')}
            value={data.cost_amount ?? 0}
            precision={2}
            prefix="¥"
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading}>
          <Statistic
            title={t('analysis.profitAmount')}
            value={data.profit_amount ?? 0}
            precision={2}
            valueStyle={{ color: (data.profit_amount ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
            prefix={
              <>
                {(data.profit_amount ?? 0) >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                <span style={{ marginLeft: 4 }}>¥</span>
              </>
            }
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading}>
          <Statistic
            title={t('analysis.profitRate')}
            value={data.profit_rate ?? 0}
            precision={2}
            suffix="%"
            valueStyle={{ color: (data.profit_rate ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default AnalysisStatistics;
