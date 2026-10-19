import { useRuntimeConfig } from '@/config/runtime';
import { Card, Col, Progress, Row, Statistic, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface AccountSummary {
  readonly total_amount: number;
  readonly total_paid: number;
  readonly total_outstanding: number;
  readonly partner_count: number;
  readonly settled_count: number;
}

interface AccountSummaryCardsProps {
  readonly kind: 'payable' | 'receivable';
  readonly summary?: AccountSummary | null;
}

const COLORS = {
  total: '#1677ff',
  paid: '#3f8600',
  outstanding: '#cf1322',
  partners: '#531dab'
};

/**
 * Reconciliation summary cards shared by the payable and receivable pages.
 * All numbers come from the backend aggregate over the full filtered partner
 * set, so they stay stable across pagination and match the active search.
 */
const AccountSummaryCards: FC<AccountSummaryCardsProps> = ({ kind, summary }) => {
  const { t } = useTranslation();
  const { currency_unit_symbol } = useRuntimeConfig();
  const prefix = kind === 'payable' ? 'payable' : 'receivable';
  const key = (name: string): string => `${prefix}.${name}`;

  const totalAmount = summary?.total_amount ?? 0;
  const totalPaid = summary?.total_paid ?? 0;
  const unsettledCount = summary ? summary.partner_count - summary.settled_count : 0;
  const paidRatio = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, paidRatio));

  return (
    <Card variant="outlined" styles={{ body: { padding: '16px 24px 12px' } }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Statistic
            title={t(key('summaryTotalAmount'))}
            value={summary ? totalAmount : '-'}
            prefix={currency_unit_symbol}
            precision={summary ? 2 : undefined}
            styles={{ content: { color: COLORS.total } }}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title={t(key('summaryPaidAmount'))}
            value={summary ? totalPaid : '-'}
            prefix={currency_unit_symbol}
            precision={summary ? 2 : undefined}
            styles={{ content: { color: COLORS.paid } }}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title={
              <span>
                {t(key('summaryOutstanding'))}{' '}
                <Tooltip title={t(key('outstandingTooltip'))}>
                  <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />
                </Tooltip>
              </span>
            }
            value={summary ? summary.total_outstanding : '-'}
            prefix={currency_unit_symbol}
            precision={summary ? 2 : undefined}
            styles={{ content: { color: COLORS.outstanding } }}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title={t(key('summaryPartnerCount'))}
            value={summary ? summary.partner_count : '-'}
            suffix={
              summary ? (
                <Text type="secondary" style={{ fontSize: 14 }}>
                  {t(key('unsettledSuffix'), { count: unsettledCount })}
                </Text>
              ) : undefined
            }
            styles={{ content: { color: COLORS.partners } }}
          />
        </Col>
      </Row>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
          {t(key('settlementProgress'))}
        </Text>
        <Progress
          percent={progressPercent}
          format={(percent) => `${percent.toFixed(1)}%`}
          strokeColor={{ '0%': COLORS.total, '100%': COLORS.paid }}
          style={{ margin: 0, flex: 1, maxWidth: 480 }}
        />
      </div>
    </Card>
  );
};

export default AccountSummaryCards;
