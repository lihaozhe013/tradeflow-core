import ResponsiveTable from '@/components/ResponsiveTable';
import InvoicedSnapshotPanel from '@/components/InvoicedSnapshotPanel';
import { useState, useEffect, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Descriptions,
  Popconfirm,
  Spin,
  Statistic,
  Tabs,
  Tag,
  message,
  Modal,
  Input,
  Space,
  Row,
  Col,
  Typography
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { TableProps } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { currency_unit_symbol } from '@/config/types';
import type { UseSimpleApiReturn } from '@/hooks/types';
import type {
  PaginationState,
  ReceivableDetailResponse,
  ReceivableFilters,
  ReceivableOutboundRecord,
  ReceivablePaymentRecord,
  ReceivableRecord,
  ReceivableSorterState
} from '../types';

const { Search } = Input;

interface ModalPaginationState {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
}

interface ReceivableTableProps {
  readonly data: ReceivableRecord[];
  readonly loading: boolean;
  readonly pagination: PaginationState;
  readonly filters: ReceivableFilters;
  readonly sorter: ReceivableSorterState;
  readonly onFilter: (filters: ReceivableFilters) => void;
  readonly onTableChange: NonNullable<TableProps<ReceivableRecord>['onChange']>;
  readonly onAddPayment: (record: ReceivableRecord) => void;
  readonly onEditPayment: (payment: ReceivablePaymentRecord, customer: ReceivableRecord) => void;
  readonly onDeletePayment: (paymentId: number) => Promise<void> | void;
  readonly apiInstance: UseSimpleApiReturn;
  readonly canWrite: boolean;
}

const DEFAULT_MODAL_PAGINATION: ModalPaginationState = {
  current: 1,
  pageSize: 5,
  total: 0
};

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return `${currency_unit_symbol}0.00`;
  }
  return `${currency_unit_symbol}${Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const ReceivableTable: FC<ReceivableTableProps> = ({
  data,
  loading,
  pagination,
  filters,
  sorter,
  onFilter,
  onTableChange,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  apiInstance,
  canWrite
}) => {
  const { t } = useTranslation();
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ReceivableRecord | null>(null);
  const [customerDetails, setCustomerDetails] = useState<ReceivableDetailResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [paymentPagination, setPaymentPagination] =
    useState<ModalPaginationState>(DEFAULT_MODAL_PAGINATION);
  const [outboundPagination, setOutboundPagination] =
    useState<ModalPaginationState>(DEFAULT_MODAL_PAGINATION);
  const [detailsTab, setDetailsTab] = useState('payments');

  const getBalanceTag = (balance: number | null | undefined): ReactNode => {
    const numeric = Number(balance ?? 0);
    if (numeric > 0) {
      return (
        <Tag color="volcano">{t('receivable.unpaid', { amount: formatCurrency(numeric) })}</Tag>
      );
    }
    if (numeric < 0) {
      return (
        <Tag color="green">
          {t('receivable.overpaid', {
            amount: formatCurrency(Math.abs(numeric))
          })}
        </Tag>
      );
    }
    return <Tag color="blue">{t('receivable.paid')}</Tag>;
  };

  const fetchCustomerDetails = async (
    customerCode: string,
    paymentPage = 1,
    outboundPage = 1
  ): Promise<void> => {
    try {
      const outboundQuery = new URLSearchParams({
        page: String(outboundPage),
        limit: String(DEFAULT_MODAL_PAGINATION.pageSize)
      });

      // Fetch payment records from details endpoint
      const detailsResult = await apiInstance.get<ReceivableDetailResponse>(
        `/receivable/details/${customerCode}?payment_page=${paymentPage}&payment_limit=${DEFAULT_MODAL_PAGINATION.pageSize}`
      );

      // Fetch uninvoiced records
      const uninvoicedResult = await apiInstance.get<{
        data: ReceivableOutboundRecord[];
        total: number;
        page: number;
        limit: number;
      }>(`/receivable/uninvoiced/${customerCode}?${outboundQuery.toString()}`);

      const result: ReceivableDetailResponse = {
        ...detailsResult,
        outbound_records: {
          data: uninvoicedResult?.data ?? [],
          total: uninvoicedResult?.total ?? 0,
          page: uninvoicedResult?.page ?? outboundPage,
          limit: uninvoicedResult?.limit ?? DEFAULT_MODAL_PAGINATION.pageSize
        }
      };

      setCustomerDetails(result);

      const paymentRecords = result.payment_records;
      if (paymentRecords) {
        setPaymentPagination({
          current: paymentRecords.page,
          pageSize: paymentRecords.limit,
          total: paymentRecords.total
        });
      }

      const outboundRecords = result.outbound_records;
      if (outboundRecords) {
        setOutboundPagination({
          current: outboundRecords.page,
          pageSize: outboundRecords.limit,
          total: outboundRecords.total
        });
      }
    } catch (error) {
      console.error('Failed to fetch customer details:', error);
      message.error(t('receivable.fetchFailedNetwork'));
    }
  };

  const handleViewDetails = async (record: ReceivableRecord): Promise<void> => {
    setDetailsLoading(true);
    setSelectedCustomer(record);
    setDetailsVisible(true);
    setPaymentPagination(DEFAULT_MODAL_PAGINATION);
    setOutboundPagination(DEFAULT_MODAL_PAGINATION);
    try {
      await fetchCustomerDetails(record.customer_code, 1, 1);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Keep the open details modal in sync after the list refreshes (for example
  // when a payment is saved or deleted from the payment modal above it) and
  // bring the payment records tab back into view so the change is visible.
  useEffect(() => {
    if (detailsVisible && selectedCustomer) {
      void fetchCustomerDetails(
        selectedCustomer.customer_code,
        paymentPagination.current,
        outboundPagination.current
      );
      setDetailsTab('payments');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handlePaymentPageChange = async (page: number): Promise<void> => {
    if (selectedCustomer) {
      await fetchCustomerDetails(selectedCustomer.customer_code, page, outboundPagination.current);
    }
  };

  const handleOutboundPageChange = async (page: number): Promise<void> => {
    if (selectedCustomer) {
      await fetchCustomerDetails(selectedCustomer.customer_code, paymentPagination.current, page);
    }
  };

  const handleSearch = (value: string): void => {
    onFilter({ customer_short_name: value || undefined });
  };

  const handleDeletePaymentConfirm = async (paymentId: number): Promise<void> => {
    await Promise.resolve(onDeletePayment(paymentId));
    if (detailsVisible && selectedCustomer) {
      await fetchCustomerDetails(
        selectedCustomer.customer_code,
        paymentPagination.current,
        outboundPagination.current
      );
    }
  };

  const getColumnSortOrder = (field: ReceivableSorterState['field']): SortOrder =>
    sorter.field === field ? (sorter.order ?? null) : null;

  const tableColumns: ColumnsType<ReceivableRecord> = [
    {
      title: t('receivable.customerCode'),
      dataIndex: 'customer_code',
      key: 'customer_code',
      width: 120,
      sorter: true,
      sortOrder: getColumnSortOrder('customer_code')
    },
    {
      title: t('receivable.customerShortName'),
      dataIndex: 'customer_short_name',
      key: 'customer_short_name',
      width: 150,
      sorter: true,
      sortOrder: getColumnSortOrder('customer_short_name')
    },
    {
      title: t('receivable.totalReceivable'),
      dataIndex: 'total_receivable',
      key: 'total_receivable',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_receivable'),
      render: (value) => formatCurrency(value)
    },
    {
      title: t('receivable.totalPaid'),
      dataIndex: 'total_paid',
      key: 'total_paid',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_paid'),
      render: (value) => formatCurrency(value)
    },
    {
      title: t('receivable.balance'),
      dataIndex: 'balance',
      key: 'balance',
      width: 130,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('balance'),
      render: (value) => getBalanceTag(value)
    },
    {
      title: t('receivable.lastPaymentDate'),
      dataIndex: 'last_payment_date',
      key: 'last_payment_date',
      width: 120,
      sorter: true,
      sortOrder: getColumnSortOrder('last_payment_date'),
      render: (value) => value ?? '-'
    },
    {
      title: t('receivable.action'),
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_value, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            {t('receivable.details')}
          </Button>
          {canWrite && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddPayment(record)}
            >
              {t('receivable.addPayment')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  const tablePagination: TablePaginationConfig = {
    ...pagination,
    showQuickJumper: true,
    showTotal: (total, range) =>
      t('receivable.paginationTotal', {
        start: range[0],
        end: range[1],
        total
      })
  };

  const detailsTabs = [
    {
      key: 'payments',
      label: t('receivable.paymentRecords'),
      children: (
        <ResponsiveTable<ReceivablePaymentRecord>
          size="small"
          dataSource={customerDetails?.payment_records?.data ?? []}
          rowKey="id"
          pagination={{
            ...paymentPagination,
            showSizeChanger: false,
            size: 'small',
            onChange: handlePaymentPageChange,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`
          }}
          scroll={{ y: 260 }}
          columns={[
            {
              title: t('receivable.paymentAmount'),
              dataIndex: 'amount',
              render: (value) => formatCurrency(value)
            },
            { title: t('receivable.paymentDate'), dataIndex: 'pay_date' },
            {
              title: t('receivable.paymentMethod'),
              dataIndex: 'pay_method'
            },
            {
              title: t('receivable.remark'),
              dataIndex: 'remark',
              ellipsis: true
            },
            ...(canWrite
              ? [
                  {
                    title: t('receivable.action'),
                    width: 120,
                    render: (_value: unknown, record: ReceivablePaymentRecord) => (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            if (selectedCustomer) {
                              onEditPayment(record, selectedCustomer);
                            }
                          }}
                        >
                          {t('receivable.editPayment')}
                        </Button>
                        <Popconfirm
                          title={t('receivable.deletePaymentConfirm')}
                          onConfirm={() => handleDeletePaymentConfirm(record.id)}
                        >
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    )
                  }
                ]
              : [])
          ]}
        />
      )
    },
    {
      key: 'uninvoiced',
      label: t('receivable.uninvoicedDetails'),
      children: (
        <ResponsiveTable
          size="small"
          dataSource={customerDetails?.outbound_records?.data ?? []}
          rowKey="id"
          pagination={{
            ...outboundPagination,
            showSizeChanger: false,
            size: 'small',
            onChange: handleOutboundPageChange,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`
          }}
          scroll={{ y: 260 }}
          columns={[
            {
              title: t('receivable.outboundDate'),
              dataIndex: 'outbound_date',
              width: 100
            },
            {
              title: t('receivable.productModel'),
              dataIndex: 'product_model',
              width: 120
            },
            {
              title: t('receivable.quantity'),
              dataIndex: 'quantity',
              width: 80,
              align: 'right'
            },
            {
              title: t('receivable.unitPrice'),
              dataIndex: 'unit_price',
              width: 100,
              align: 'right',
              render: (value) => formatCurrency(value)
            },
            {
              title: t('receivable.totalPrice'),
              dataIndex: 'total_price',
              width: 100,
              align: 'right',
              render: (value) => formatCurrency(value)
            },
            {
              title: t('receivable.orderNumber'),
              dataIndex: 'order_number',
              width: 120,
              ellipsis: true
            },
            {
              title: t('receivable.remark'),
              dataIndex: 'remark',
              ellipsis: true
            }
          ]}
        />
      )
    },
    {
      key: 'invoiced',
      label: t('receivable.invoicedDetails'),
      children: (
        <InvoicedSnapshotPanel
          direction="receivable"
          partnerCode={selectedCustomer?.customer_code ?? null}
          canWrite={canWrite}
        />
      )
    }
  ];

  return (
    <>
      <Row style={{ marginBottom: 16 }}>
        <Col>
          <Search
            placeholder={t('receivable.searchCustomer') ?? ''}
            allowClear
            onSearch={handleSearch}
            style={{ width: 250 }}
            defaultValue={filters.customer_short_name}
          />
        </Col>
      </Row>

      <ResponsiveTable<ReceivableRecord>
        columns={tableColumns}
        dataSource={data}
        rowKey="customer_code"
        loading={loading}
        pagination={tablePagination}
        onChange={onTableChange}
        scroll={{ x: 960 }}
        size="medium"
      />

      <Modal
        title={`${t('receivable.details')} - ${selectedCustomer?.customer_short_name ?? ''}`}
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        width={1000}
        style={{ top: 20 }}
        destroyOnHidden
        footer={
          <Space>
            {canWrite && selectedCustomer && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => onAddPayment(selectedCustomer)}
              >
                {t('receivable.addPayment')}
              </Button>
            )}
            <Button onClick={() => setDetailsVisible(false)}>{t('receivable.close')}</Button>
          </Space>
        }
      >
        {detailsLoading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin />
          </div>
        ) : customerDetails ? (
          <div>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, md: 3 }}
              title={t('receivable.customerInfo')}
              style={{ marginBottom: 16 }}
              items={[
                {
                  key: 'code',
                  label: t('receivable.customerCode'),
                  children: customerDetails.customer?.code ?? '-'
                },
                {
                  key: 'short_name',
                  label: t('receivable.customerShortName'),
                  children: customerDetails.customer?.short_name ?? '-'
                },
                {
                  key: 'full_name',
                  label: t('receivable.customerFullName'),
                  children: customerDetails.customer?.full_name ?? '-'
                }
              ]}
            />

            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              {t('receivable.summary')}
            </Typography.Title>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 32,
                alignItems: 'center',
                marginBottom: 8
              }}
            >
              <Statistic
                title={t('receivable.totalReceivable')}
                value={customerDetails.summary?.total_receivable ?? 0}
                precision={2}
                prefix={currency_unit_symbol}
              />
              <Statistic
                title={t('receivable.totalPaid')}
                value={customerDetails.summary?.total_paid ?? 0}
                precision={2}
                prefix={currency_unit_symbol}
                valueStyle={{ color: '#3f8600' }}
              />
              <Statistic
                title={t('receivable.balance')}
                value={Math.abs(Number(customerDetails.summary?.balance ?? 0))}
                precision={2}
                prefix={currency_unit_symbol}
                valueStyle={{
                  color: Number(customerDetails.summary?.balance ?? 0) > 0 ? '#cf1322' : '#3f8600'
                }}
                suffix={getBalanceTag(customerDetails.summary?.balance)}
              />
            </div>

            <Tabs defaultActiveKey="payments" activeKey={detailsTab} onChange={setDetailsTab} items={detailsTabs} />
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default ReceivableTable;
