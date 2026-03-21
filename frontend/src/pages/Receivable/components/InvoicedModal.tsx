import { useState, useEffect, useCallback, type FC } from 'react';
import { Modal, Table, Button, message, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { currency_unit_symbol } from '@/config/types';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { UseSimpleApiReturn } from '@/hooks/types';
import type { InvoicedRecord, InvoicedRecordsResponse } from '../types';

const { Text } = Typography;

interface InvoicedModalProps {
  readonly visible: boolean;
  readonly customerCode: string | null;
  readonly customerName: string | null;
  readonly onCancel: () => void;
  readonly apiInstance: UseSimpleApiReturn;
}

interface ModalPaginationState {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
}

const DEFAULT_PAGINATION: ModalPaginationState = {
  current: 1,
  pageSize: 10,
  total: 0,
};

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return `${currency_unit_symbol}0.00`;
  }
  return `${currency_unit_symbol}${Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const InvoicedModal: FC<InvoicedModalProps> = ({
  visible,
  customerCode,
  customerName,
  onCancel,
  apiInstance,
}) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<InvoicedRecord[]>([]);
  const [pagination, setPagination] = useState<ModalPaginationState>(DEFAULT_PAGINATION);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchInvoicedRecords = useCallback(
    async (page = 1): Promise<void> => {
      if (!customerCode) return;

      try {
        setLoading(true);
        const query = new URLSearchParams({
          page: String(page),
          limit: String(DEFAULT_PAGINATION.pageSize),
        });

        const result = await apiInstance.get<InvoicedRecordsResponse>(
          `/receivable/invoiced/${customerCode}?${query.toString()}`,
        );

        setData(result?.data ?? []);
        setPagination({
          current: result?.page ?? page,
          pageSize: DEFAULT_PAGINATION.pageSize,
          total: result?.total ?? 0,
        });
        setLastUpdated(result?.last_updated ?? null);
      } catch (error) {
        console.error('获取已开票记录失败:', error);
        message.error('Failed to fetch invoiced records. Please refresh the cache first.');
      } finally {
        setLoading(false);
      }
    },
    [customerCode, apiInstance],
  );

  const handleRefreshCache = async (): Promise<void> => {
    if (!customerCode) return;

    try {
      setRefreshing(true);
      await apiInstance.post(`/receivable/invoices/refresh/${customerCode}`, {});
      message.success('Invoice cache refreshed successfully');
      await fetchInvoicedRecords(pagination.current);
    } catch (error) {
      console.error('刷新缓存失败:', error);
      message.error('Failed to refresh cache');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (visible && customerCode) {
      setPagination(DEFAULT_PAGINATION);
      fetchInvoicedRecords(1);
    }
  }, [visible, customerCode, fetchInvoicedRecords]);

  const handleTableChange = (paginationConfig: TablePaginationConfig): void => {
    const page = paginationConfig.current ?? 1;
    fetchInvoicedRecords(page);
  };

  const columns: ColumnsType<InvoicedRecord> = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      width: 150,
    },
    {
      title: 'Invoice Date',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      width: 120,
      render: (value) => value ?? '-',
    },
    {
      title: 'Total Amount',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 150,
      align: 'right',
      render: (value) => formatCurrency(value),
    },
    {
      title: 'Record Count',
      dataIndex: 'record_count',
      key: 'record_count',
      width: 120,
      align: 'center',
    },
  ];

  return (
    <Modal
      title={`Invoiced Details - ${customerName ?? ''}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={800}
      style={{ top: 20 }}
    >
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text type="secondary">
          {lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleString()}` : ''}
        </Text>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={handleRefreshCache}
          loading={refreshing}
        >
          Refresh Cache
        </Button>
      </div>

      <Table<InvoicedRecord>
        columns={columns}
        dataSource={data}
        rowKey="invoice_number"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
        }}
        onChange={handleTableChange}
        size="small"
      />
    </Modal>
  );
};

export default InvoicedModal;
