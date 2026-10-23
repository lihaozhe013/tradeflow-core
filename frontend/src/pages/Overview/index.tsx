import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Segmented,
  Skeleton,
  Table,
  Typography
} from 'antd';
import { PlusOutlined, ReloadOutlined, ArrowRightOutlined } from '@ant-design/icons';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest, RequestError } from '@/utils/request';
import { useRuntimeConfig } from '@/config/runtime';
import { usePermissions } from '@/auth/usePermissions';
import './dashboard.css';

type Metric = {
  sales: number;
  profit: number;
  cost: number;
  margin: number | null;
  purchase: number;
  inbound: number;
  outbound: number;
};
type Rank = { code: string; name: string; amount: number; count: number };
type Stock = {
  product_model: string;
  quantity: number;
  recent_quantity: number;
  last_outbound: string | null;
};
type Period = {
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
  metrics: Metric;
  previous: Metric;
  trend: { start: string; end: string; sales: number; profit: number }[];
  products: Rank[];
  customers: Rank[];
};
type Dashboard = {
  version: 1;
  as_of_date: string;
  last_updated: string;
  next_auto_refresh_at: string;
  periods: Record<string, Period>;
  funds: {
    receivable: number;
    payable: number;
    receivable_count: number;
    payable_count: number;
    customers: Rank[];
    suppliers: Rank[];
  };
  attention: {
    review_enabled: boolean;
    inbound: number;
    outbound: number;
    negative: Stock[];
    zero: Stock[];
  };
};
function parseDashboard(value: unknown): Dashboard {
  const data = value as Dashboard;
  const finite = (values: unknown[]) =>
    values.every((item) => typeof item === 'number' && Number.isFinite(item));
  const ranks = (rows: Rank[]) =>
    Array.isArray(rows) &&
    rows.every(
      (row) =>
        typeof row.code === 'string' &&
        typeof row.name === 'string' &&
        finite([row.amount, row.count])
    );
  const stocks = (rows: Stock[]) =>
    Array.isArray(rows) &&
    rows.every(
      (row) =>
        typeof row.product_model === 'string' &&
        finite([row.quantity, row.recent_quantity]) &&
        (row.last_outbound === null || typeof row.last_outbound === 'string')
    );
  if (
    !data ||
    data.version !== 1 ||
    !Number.isFinite(Date.parse(data.last_updated)) ||
    !Number.isFinite(Date.parse(data.next_auto_refresh_at)) ||
    !['month', '30', '90', '365'].every((key) => {
      const period = data.periods[key];
      return (
        period &&
        [period.start, period.end, period.previous_start, period.previous_end].every((date) =>
          /^\d{4}-\d{2}-\d{2}$/.test(date)
        ) &&
        [period.metrics, period.previous].every(
          (metric) =>
            finite([
              metric.sales,
              metric.profit,
              metric.cost,
              metric.purchase,
              metric.inbound,
              metric.outbound
            ]) &&
            (metric.margin === null || finite([metric.margin]))
        ) &&
        Array.isArray(period.trend) &&
        period.trend.every(
          (row) =>
            typeof row.start === 'string' &&
            typeof row.end === 'string' &&
            finite([row.sales, row.profit])
        ) &&
        ranks(period.products) &&
        ranks(period.customers)
      );
    }) ||
    !finite([
      data.funds.receivable,
      data.funds.payable,
      data.funds.receivable_count,
      data.funds.payable_count,
      data.attention.inbound,
      data.attention.outbound
    ]) ||
    typeof data.attention.review_enabled !== 'boolean' ||
    !ranks(data.funds.customers) ||
    !ranks(data.funds.suppliers) ||
    !stocks(data.attention.negative) ||
    !stocks(data.attention.zero)
  )
    throw new Error('Invalid dashboard response.');
  return data;
}
export default function Overview() {
  const { t, i18n } = useTranslation();
  const { currency_unit_symbol } = useRuntimeConfig();
  const { canWrite } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const periodKey = ['month', '30', '90', '365'].includes(params.get('period') ?? '')
    ? params.get('period')!
    : 'month';
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [stock, setStock] = useState<'negative' | 'zero' | null>(null);
  const [rankTab, setRankTab] = useState('products');
  const [fundTab, setFundTab] = useState('customers');
  const [showTable, setShowTable] = useState(false);
  const version = useRef(0);
  const pending = useRef(false);
  const label = (key: string) => t('dashboard.' + key);
  const number = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = (value: number) => currency_unit_symbol + ' ' + number(value);
  const load = useCallback(async (refresh = false) => {
    if (pending.current) return;
    pending.current = true;
    const request = ++version.current;
    if (refresh) setRefreshing(true);
    try {
      const value = parseDashboard(
        await apiRequest<unknown>(
          '/overview/dashboard',
          refresh ? { method: 'POST', body: {} } : undefined
        )
      );
      if (request === version.current) {
        setData(value);
        setError('');
      }
    } catch (err) {
      if (request === version.current)
        setError(err instanceof RequestError && err.status === 503 ? 'notReady' : 'failed');
    } finally {
      pending.current = false;
      if (request === version.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);
  useEffect(() => {
    void load();
    const read = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = window.setInterval(read, 300_000);
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [load]);
  const period = data?.periods[periodKey];
  const analysis = (extra: Record<string, string> = {}) =>
    navigate(
      '/analysis?' +
        new URLSearchParams({
          start_date: period!.start,
          end_date: period!.end,
          type: 'outbound',
          ...extra
        })
    );
  const delta = (current: number | null, previous: number | null, percentage = false) => {
    if (current === null || previous === null) return '—';
    const diff = current - previous;
    return (
      (diff > 0 ? '+' : '') +
      (percentage
        ? number(diff) + ' ' + label('points')
        : previous > 0
          ? number((diff / previous) * 100) + '%'
          : amount(diff))
    );
  };
  const ranks = period ? (rankTab === 'products' ? period.products : period.customers) : [];
  return (
    <div className="business-dashboard">
      <header className="business-header">
        <div>
          <span className="business-eyebrow">TRADEFLOW / {label('workspace')}</span>
          <Typography.Title level={2}>{label('title')}</Typography.Title>
          <Typography.Text type="secondary">{label('subtitle')}</Typography.Text>
        </div>
        <div className="business-actions">
          <Button
            aria-label={label('refresh')}
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={refreshing}
            onClick={() => void load(true)}
          >
            {label('refresh')}
          </Button>
          {canWrite && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'inbound', label: t('overview.quickInbound') },
                  { key: 'outbound', label: t('overview.quickOutbound') }
                ],
                onClick: ({ key }) => navigate('/' + key + '?create=1')
              }}
            >
              <Button
                type="primary"
                aria-label={label('newBusiness')}
                icon={<PlusOutlined aria-hidden="true" />}
              >
                {label('newBusiness')}
              </Button>
            </Dropdown>
          )}
        </div>
      </header>
      <div className="business-toolbar">
        <Segmented
          aria-label={label('period')}
          value={periodKey}
          onChange={(value) => setParams({ period: String(value) })}
          options={['month', '30', '90', '365'].map((value) => ({
            value,
            label: label('period' + value)
          }))}
        />
        {data && (
          <div className="business-timestamp">
            <span>
              {label('updated')} {new Date(data.last_updated).toLocaleString(i18n.language)}
            </span>
            <span>
              {label('nextUpdate')}{' '}
              {new Date(data.next_auto_refresh_at).toLocaleString(i18n.language)}
            </span>
          </div>
        )}
      </div>
      {error && (
        <Alert
          showIcon
          type={error === 'notReady' ? 'info' : 'error'}
          title={label(error)}
          action={<Button onClick={() => void load(error === 'notReady')}>{label('retry')}</Button>}
        />
      )}
      {data && Date.now() - Date.parse(data.last_updated) > 86_400_000 && (
        <Alert showIcon type="warning" title={label('stale')} />
      )}
      {loading && !data && <Skeleton active paragraph={{ rows: 8 }} />}
      {period && data && (
        <>
          <div className="business-range">
            {period.start} — {period.end}
            <span>
              {label('compared')} {period.previous_start} — {period.previous_end}
            </span>
          </div>
          <section className="business-metrics" aria-label={label('metrics')}>
            {(['sales', 'profit', 'margin', 'purchase'] as const).map((key, index) => (
              <Card key={key} className={'business-metric metric-' + key}>
                <div className="business-metric-label">{label(key)}</div>
                <div className="business-value">
                  {period.metrics[key] === null
                    ? '—'
                    : key === 'margin'
                      ? number(period.metrics[key]!) + '%'
                      : amount(period.metrics[key]!)}
                </div>
                <div className="business-delta">
                  {delta(period.metrics[key], period.previous[key], key === 'margin')}{' '}
                  <span>{label('vsPrevious')}</span>
                </div>
                <div className="business-metric-foot">
                  {index === 0
                    ? label('outboundRecords') + ': ' + period.metrics.outbound
                    : index === 1
                      ? label('cost') + ': ' + amount(period.metrics.cost)
                      : index === 2
                        ? label('fifo')
                        : label('inboundRecords') + ': ' + period.metrics.inbound}
                </div>
              </Card>
            ))}
          </section>
          <section className="business-main-grid">
            <Card
              title={label('trend')}
              extra={
                <Button type="link" onClick={() => analysis()}>
                  {label('analysis')} <ArrowRightOutlined aria-hidden="true" />
                </Button>
              }
            >
              <p className="business-note">{label('fifoNote')}</p>
              <div className="business-chart" role="img" aria-label={label('trendDescription')}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={period.trend}
                    margin={{ left: 8, right: 18, top: 15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4" />
                    <XAxis
                      dataKey="start"
                      tickFormatter={(value) => value.slice(5)}
                      minTickGap={28}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      width={70}
                      tickFormatter={(value) =>
                        new Intl.NumberFormat(i18n.language, { notation: 'compact' }).format(value)
                      }
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(value) => amount(Number(value))} />
                    <Line
                      name={label('sales')}
                      type="monotone"
                      dataKey="sales"
                      stroke="#1677ff"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      name={label('profit')}
                      type="monotone"
                      dataKey="profit"
                      stroke="#64748b"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="business-chart-legend">
                <span>● {label('sales')}</span>
                <span>— {label('profit')}</span>
                <Button type="link" onClick={() => setShowTable(!showTable)}>
                  {label('dataTable')}
                </Button>
              </div>
              {showTable && (
                <Table
                  size="small"
                  rowKey="start"
                  dataSource={period.trend}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: label('period'),
                      dataIndex: 'start',
                      render: (value, row) => (
                        <Button
                          type="link"
                          onClick={() => analysis({ start_date: row.start, end_date: row.end })}
                        >
                          {value} — {row.end}
                        </Button>
                      )
                    },
                    { title: label('sales'), dataIndex: 'sales', render: amount },
                    { title: label('profit'), dataIndex: 'profit', render: amount }
                  ]}
                />
              )}
            </Card>
            <Card title={label('attention')}>
              <p className="business-note">{label('snapshotNote')}</p>
              <div className="business-attention">
                {data.attention.review_enabled &&
                  ['inbound', 'outbound'].map((direction) => (
                    <button
                      key={direction}
                      onClick={() =>
                        navigate('/transaction-drafts?direction=' + direction + '&status=pending')
                      }
                    >
                      <span>{label('pending' + direction)}</span>
                      <strong>{data.attention[direction as 'inbound' | 'outbound']}</strong>
                      <ArrowRightOutlined aria-hidden="true" />
                    </button>
                  ))}
                {(['negative', 'zero'] as const).map((kind) => (
                  <button key={kind} onClick={() => setStock(kind)}>
                    <span>
                      <i className={'business-dot ' + kind} />
                      {label(kind)}
                    </span>
                    <strong>{data.attention[kind].length}</strong>
                    <ArrowRightOutlined aria-hidden="true" />
                  </button>
                ))}
              </div>
              <p className="business-note business-attention-note">{label('zeroNote')}</p>
            </Card>
          </section>
          <section className="business-bottom-grid">
            <Card title={label('funds')}>
              <p className="business-note">{label('snapshotNote')}</p>
              <div className="business-funds">
                {(['receivable', 'payable'] as const).map((kind) => (
                  <div key={kind}>
                    <span>{label(kind)}</span>
                    <strong>{amount(data.funds[kind])}</strong>
                    <small>
                      {data.funds[(kind + '_count') as 'receivable_count' | 'payable_count']}{' '}
                      {label('unsettled')}
                    </small>
                  </div>
                ))}
              </div>
              <Segmented
                value={fundTab}
                onChange={(value) => setFundTab(String(value))}
                options={[
                  { value: 'customers', label: label('receivable') },
                  { value: 'suppliers', label: label('payable') }
                ]}
              />
              <div className="business-ranking">
                {(fundTab === 'customers' ? data.funds.customers : data.funds.suppliers).map(
                  (row) => (
                    <button
                      key={row.code}
                      onClick={() =>
                        navigate(
                          '/' +
                            (fundTab === 'customers' ? 'receivable' : 'payable') +
                            '?' +
                            new URLSearchParams({
                              [fundTab === 'customers'
                                ? 'customer_short_name'
                                : 'supplier_short_name']: row.name
                            })
                        )
                      }
                    >
                      <span className="business-rank-name">{row.name}</span>
                      <strong>{amount(row.amount)}</strong>
                      <ArrowRightOutlined aria-hidden="true" />
                    </button>
                  )
                )}
                {!(fundTab === 'customers' ? data.funds.customers : data.funds.suppliers)
                  .length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              </div>
            </Card>
            <Card
              title={label('contribution')}
              extra={
                <Segmented
                  value={rankTab}
                  onChange={(value) => setRankTab(String(value))}
                  options={[
                    { value: 'products', label: label('products') },
                    { value: 'customers', label: label('customers') }
                  ]}
                />
              }
            >
              <p className="business-note">{label('rankingNote')}</p>
              <div className="business-ranking contribution-ranking">
                {ranks.map((row, index) => (
                  <button
                    key={row.code}
                    onClick={() =>
                      analysis(
                        rankTab === 'products'
                          ? { product_model: row.name }
                          : { customer_code: row.code }
                      )
                    }
                  >
                    <span className="business-rank-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="business-rank-name">
                      <Typography.Text ellipsis={{ tooltip: row.name }}>
                        {row.name || label('unknown')}
                      </Typography.Text>
                      <div className="business-bar">
                        <span
                          style={{
                            width:
                              Math.max(
                                0,
                                Math.min(
                                  100,
                                  (row.amount / Math.max(1, ...ranks.map((r) => r.amount))) * 100
                                )
                              ) + '%'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <strong>{amount(row.amount)}</strong>
                      <small>
                        {row.count} {label('records')}
                      </small>
                    </div>
                    <ArrowRightOutlined aria-hidden="true" />
                  </button>
                ))}
                {!ranks.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              </div>
            </Card>
          </section>
        </>
      )}
      <Drawer
        title={stock ? label(stock) : ''}
        open={!!stock}
        onClose={() => setStock(null)}
        size="large"
      >
        <p>{label('snapshotNote')}</p>
        <Table
          rowKey="product_model"
          scroll={{ x: 600 }}
          dataSource={stock && data ? data.attention[stock] : []}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: label('products'),
              dataIndex: 'product_model',
              render: (value) => (
                <Button
                  type="link"
                  onClick={() =>
                    navigate('/inventory?' + new URLSearchParams({ product_model: value }))
                  }
                >
                  {value}
                </Button>
              )
            },
            { title: label('quantity'), dataIndex: 'quantity' },
            { title: label('recentQuantity'), dataIndex: 'recent_quantity' },
            { title: label('lastOutbound'), dataIndex: 'last_outbound' }
          ]}
        />
      </Drawer>
    </div>
  );
}
