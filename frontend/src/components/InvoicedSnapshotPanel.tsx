import { useRuntimeConfig } from '@/config/runtime';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Button, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ResponsiveTable from '@/components/ResponsiveTable';
import { apiRequest, RequestError } from '@/utils/request';
import type { ColumnsType } from 'antd/es/table';
import type { InvoicedRecord, InvoicedRecordsResponse } from '@/pages/Receivable/types';

interface Props {
  direction: 'receivable' | 'payable';
  partnerCode: string | null;
  canWrite: boolean;
}

const PAGE_SIZE = 10;

/**
 * Invoice snapshot listing without dialog chrome so it can be embedded
 * in a details-modal tab as well as wrapped by a standalone modal.
 */
export default function InvoicedSnapshotPanel({ direction, partnerCode, canWrite }: Props) {
  const { t } = useTranslation();
  const { currency_unit_symbol } = useRuntimeConfig();
  const [data, setData] = useState<InvoicedRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const refreshPending = useRef(false);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!partnerCode) return;
      const requestVersion = ++version.current;
      setLoading(true);
      setError(null);
      try {
        const result = await apiRequest<InvoicedRecordsResponse>(
          `/${direction}/invoiced/${encodeURIComponent(partnerCode)}?page=${nextPage}&limit=${PAGE_SIZE}`
        );
        if (requestVersion !== version.current) return;
        setData(result.data);
        setPage(result.page);
        setTotal(result.total);
        setLastUpdated(result.last_updated ?? null);
        setNotReady(false);
      } catch (err) {
        if (requestVersion !== version.current) return;
        if (
          err instanceof RequestError &&
          (err.data as { code?: string })?.code === 'SNAPSHOT_NOT_READY'
        ) {
          setNotReady(true);
        } else {
          setError('snapshot.loadFailed');
        }
      } finally {
        if (requestVersion === version.current) setLoading(false);
      }
    },
    [direction, partnerCode]
  );

  useEffect(() => {
    setData([]);
    setPage(1);
    setTotal(0);
    setLastUpdated(null);
    setError(null);
    setNotReady(false);
    setRefreshing(false);
    setLoading(false);
    refreshPending.current = false;
    void fetchPage(1);
    return () => {
      version.current++;
    };
  }, [fetchPage]);

  const refresh = async () => {
    if (!partnerCode || !canWrite || refreshPending.current) return;
    refreshPending.current = true;
    const requestVersion = ++version.current;
    setRefreshing(true);
    setError(null);
    try {
      const result = await apiRequest<
        Pick<InvoicedRecordsResponse, 'data' | 'total' | 'last_updated'>
      >(`/${direction}/invoices/refresh/${encodeURIComponent(partnerCode)}`, {
        method: 'POST',
        body: {}
      });
      if (requestVersion !== version.current) return;
      setData(result.data.slice(0, PAGE_SIZE));
      setPage(1);
      setTotal(result.total);
      setLastUpdated(result.last_updated ?? null);
      setNotReady(false);
      message.success(t('snapshot.refreshed'));
    } catch (err) {
      if (requestVersion === version.current) {
        setError(
          err instanceof RequestError && err.status === 409
            ? 'snapshot.refreshConflict'
            : 'snapshot.refreshFailed'
        );
      }
    } finally {
      if (requestVersion === version.current) {
        refreshPending.current = false;
        setRefreshing(false);
        setLoading(false);
      }
    }
  };

  const columns: ColumnsType<InvoicedRecord> = [
    {
      title: t('snapshot.invoiceNumber'),
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      width: 150
    },
    {
      title: t('snapshot.invoiceDate'),
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      width: 120,
      render: (value) => value ?? '-'
    },
    {
      title: t('snapshot.totalAmount'),
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 150,
      align: 'right',
      render: (value: number) =>
        `${currency_unit_symbol}${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },
    {
      title: t('snapshot.recordCount'),
      dataIndex: 'record_count',
      key: 'record_count',
      width: 120,
      align: 'center'
    }
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Typography.Text type="secondary">
          {lastUpdated
            ? t('snapshot.lastUpdated', { time: new Date(lastUpdated).toLocaleString() })
            : ''}
        </Typography.Text>
        {canWrite && (
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={refresh}
            loading={refreshing}
            disabled={loading || !partnerCode}
          >
            {t('snapshot.refreshData')}
          </Button>
        )}
      </div>
      {notReady && <Alert type="info" showIcon title={t('snapshot.notReady')} />}
      {error && <Alert type="error" showIcon title={t(error)} />}
      <ResponsiveTable<InvoicedRecord>
        columns={columns}
        dataSource={data}
        rowKey="invoice_number"
        loading={loading || refreshing}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false }}
        onChange={(pagination) => {
          if (!refreshPending.current) void fetchPage(pagination.current ?? 1);
        }}
      />
    </div>
  );
}
