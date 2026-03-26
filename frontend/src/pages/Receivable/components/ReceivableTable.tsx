import { useState, useMemo, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  Button,
  Popconfirm,
  Tag,
  message,
  Modal,
  Input,
  Space,
  Typography,
  Row,
  Col,
} from 'antd';
import { currency_unit_symbol } from '@/config/types';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { TableProps } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import InvoicedModal from './InvoicedModal';
import type { UseSimpleApiReturn } from '@/hooks/types';
import type {
  PaginationState,
  ReceivableDetailResponse,
  ReceivableFilters,
  ReceivableOutboundRecord,
  ReceivablePaymentRecord,
  ReceivableRecord,
  ReceivableSorterState,
} from '../types';

const { Search } = Input;
const { Text, Title } = Typography;

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
}

const DEFAULT_MODAL_PAGINATION: ModalPaginationState = {
  current: 1,
  pageSize: 5,
  total: 0,
};

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return '${currency_unit_symbol}0.00';
  }
  return `${currency_unit_symbol}${Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  const [invoicedModalVisible, setInvoicedModalVisible] = useState(false);

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
          {t('receivable.overpaid', { amount: formatCurrency(Math.abs(numeric)) })}
        </Tag>
      );
    }
    return <Tag color="blue">{t('receivable.paid')}</Tag>;
  };

  const fetchCustomerDetails = async (
    customerCode: string,
    paymentPage = 1,
    outboundPage = 1,
  ): Promise<void> => {
    try {
      const outboundQuery = new URLSearchParams({
        page: String(outboundPage),
        limit: String(DEFAULT_MODAL_PAGINATION.pageSize),
      });

      // Fetch payment records from details endpoint
      const detailsResult = await apiInstance.get<ReceivableDetailResponse>(
        `/receivable/details/${customerCode}?payment_page=${paymentPage}&payment_limit=${DEFAULT_MODAL_PAGINATION.pageSize}`,
      );

      // Fetch uninvoiced records
      const uninvoicedResult = await apiInstance.get<{
        data: any[];
        total: number;
        page: number;
        limit: number;
      }>(`/receivable/uninvoiced/${customerCode}?${outboundQuery.toString()}`);

      const result = {
        ...detailsResult,
        outbound_records: { data: uninvoicedResult?.data ?? [] },
        outbound_pagination: {
          page: uninvoicedResult?.page ?? outboundPage,
          total: uninvoicedResult?.total ?? 0,
        },
      };

      setCustomerDetails(result ?? null);

      const paymentPaginationInfo = result?.payment_pagination;
      if (paymentPaginationInfo) {
        setPaymentPagination({
          current: paymentPaginationInfo.page,
          pageSize: DEFAULT_MODAL_PAGINATION.pageSize,
          total: paymentPaginationInfo.total,
        });
      }

      const outboundPaginationInfo = result?.outbound_pagination;
      if (outboundPaginationInfo) {
        setOutboundPagination({
          current: outboundPaginationInfo.page,
          pageSize: DEFAULT_MODAL_PAGINATION.pageSize,
          total: outboundPaginationInfo.total,
        });
      }
    } catch (error) {
      console.error('获取客户详情失败:', error);
      message.error(t('receivable.fetchFailedNetwork'));
    }
  };

  const handleViewDetails = async (record: ReceivableRecord): Promise<void> => {
    try {
      setDetailsLoading(true);
      setSelectedCustomer(record);
      setDetailsVisible(true);
      setPaymentPagination(DEFAULT_MODAL_PAGINATION);
      setOutboundPagination(DEFAULT_MODAL_PAGINATION);
      await fetchCustomerDetails(record.customer_code, 1, 1);
    } catch (error) {
      console.error('获取客户详情失败:', error);
      message.error(t('receivable.fetchFailedNetwork'));
    } finally {
      setDetailsLoading(false);
    }
  };

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
        outboundPagination.current,
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
      sortOrder: getColumnSortOrder('customer_code'),
    },
    {
      title: t('receivable.customerShortName'),
      dataIndex: 'customer_short_name',
      key: 'customer_short_name',
      width: 150,
      sorter: true,
      sortOrder: getColumnSortOrder('customer_short_name'),
    },
    {
      title: t('receivable.customerFullName'),
      dataIndex: 'customer_full_name',
      key: 'customer_full_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: t('receivable.totalReceivable'),
      dataIndex: 'total_receivable',
      key: 'total_receivable',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_receivable'),
      render: (value) => formatCurrency(value),
    },
    {
      title: t('receivable.totalPaid'),
      dataIndex: 'total_paid',
      key: 'total_paid',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_paid'),
      render: (value) => formatCurrency(value),
    },
    {
      title: t('receivable.balance'),
      dataIndex: 'balance',
      key: 'balance',
      width: 130,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('balance'),
      render: (value) => getBalanceTag(value),
    },
    {
      title: t('receivable.lastPaymentDate'),
      dataIndex: 'last_payment_date',
      key: 'last_payment_date',
      width: 120,
      sorter: true,
      sortOrder: getColumnSortOrder('last_payment_date'),
      render: (value) => value ?? '-',
    },
    {
      title: t('receivable.lastPaymentMethod'),
      dataIndex: 'last_payment_method',
      key: 'last_payment_method',
      width: 100,
      render: (value) => value ?? '-',
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
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddPayment(record)}
          >
            {t('receivable.addPayment')}
          </Button>
        </Space>
      ),
    },
  ];

  const searchStats = useMemo(() => {
    const totalReceivable = data.reduce((sum, item) => sum + (item.total_receivable ?? 0), 0);
    const totalUnpaid = data.reduce((sum, item) => sum + Math.max(item.balance ?? 0, 0), 0);
    return {
      totalReceivable,
      totalUnpaid,
    };
  }, [data]);

  const tablePagination: TablePaginationConfig = {
    ...pagination,
    showQuickJumper: true,
    showTotal: (total, range) =>
      t('receivable.paginationTotal', { start: range[0], end: range[1], total }),
  };

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Search
            placeholder={t('receivable.searchCustomer') ?? ''}
            allowClear
            onSearch={handleSearch}
            style={{ width: 250 }}
            defaultValue={filters.customer_short_name}
          />
        </Col>
        <Col>
          <Text type="secondary">
            {t('receivable.totalCustomers', {
              count: pagination.total,
              totalReceivable: formatCurrency(searchStats.totalReceivable),
              totalUnpaid: formatCurrency(searchStats.totalUnpaid),
            })}
          </Text>
        </Col>
      </Row>

      <Table<ReceivableRecord>
        columns={tableColumns}
        dataSource={data}
        rowKey="customer_code"
        loading={loading}
        pagination={tablePagination}
        onChange={onTableChange}
        scroll={{ x: 1200 }}
        size="middle"
      />

      <Modal
        title={`${t('receivable.details')} - ${selectedCustomer?.customer_short_name ?? ''}`}
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        footer={null}
        width={1000}
        style={{ top: 20 }}
      >
        {detailsLoading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>{t('receivable.loading')}</div>
        ) : customerDetails ? (
          <div>
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>{t('receivable.customerInfo')}</Title>
              <Row gutter={16}>
                <Col span={8}>
                  {t('receivable.customerCode')}: {customerDetails.customer?.code ?? '-'}
                </Col>
                <Col span={8}>
                  {t('receivable.customerShortName')}: {customerDetails.customer?.short_name ?? '-'}
                </Col>
                <Col span={8}>
                  {t('receivable.customerFullName')}: {customerDetails.customer?.full_name ?? '-'}
                </Col>
              </Row>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5}>{t('receivable.summary')}</Title>
              <Row gutter={16}>
                <Col span={8}>
                  {t('receivable.totalReceivable')}:{' '}
                  {formatCurrency(customerDetails.summary?.total_receivable)}
                </Col>
                <Col span={8}>
                  {t('receivable.totalPaid')}: {formatCurrency(customerDetails.summary?.total_paid)}
                </Col>
                <Col span={8}>
                  {t('receivable.balance')}:{getBalanceTag(customerDetails.summary?.balance)}
                </Col>
              </Row>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5}>
                {t('receivable.paymentRecords')}
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ marginLeft: 16 }}
                  onClick={() => {
                    setDetailsVisible(false);
                    if (selectedCustomer) {
                      onAddPayment(selectedCustomer);
                    }
                  }}
                >
                  {t('receivable.addPayment')}
                </Button>
              </Title>
              <Table<ReceivablePaymentRecord>
                size="small"
                dataSource={customerDetails.payment_records?.data ?? []}
                rowKey="id"
                pagination={{
                  ...paymentPagination,
                  showSizeChanger: false,
                  size: 'small',
                  onChange: handlePaymentPageChange,
                  showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                }}
                scroll={{ y: 200 }}
                columns={[
                  {
                    title: t('receivable.paymentAmount'),
                    dataIndex: 'amount',
                    render: (value) => formatCurrency(value),
                  },
                  { title: t('receivable.paymentDate'), dataIndex: 'pay_date' },
                  { title: t('receivable.paymentMethod'), dataIndex: 'pay_method' },
                  { title: t('receivable.remark'), dataIndex: 'remark', ellipsis: true },
                  {
                    title: t('receivable.action'),
                    width: 120,
                    render: (_value, record) => (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setDetailsVisible(false);
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
                    ),
                  },
                ]}
              />
            </div>

            <div>
              <Title level={5}>
                {t('receivable.uninvoicedDetails')}
                <Button
                  type="default"
                  size="small"
                  style={{ marginLeft: 16 }}
                  onClick={() => setInvoicedModalVisible(true)}
                >
                  {t('receivable.viewInvoicedDetails')}
                </Button>
              </Title>
              <Table<ReceivableOutboundRecord>
                size="small"
                dataSource={customerDetails.outbound_records?.data ?? []}
                rowKey="id"
                pagination={{
                  ...outboundPagination,
                  showSizeChanger: false,
                  size: 'small',
                  onChange: handleOutboundPageChange,
                  showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                }}
                scroll={{ y: 200 }}
                columns={[
                  { title: t('receivable.outboundDate'), dataIndex: 'outbound_date', width: 100 },
                  { title: t('receivable.productModel'), dataIndex: 'product_model', width: 120 },
                  {
                    title: t('receivable.quantity'),
                    dataIndex: 'quantity',
                    width: 80,
                    align: 'right',
                  },
                  {
                    title: t('receivable.unitPrice'),
                    dataIndex: 'unit_price',
                    width: 100,
                    align: 'right',
                    render: (value) => formatCurrency(value),
                  },
                  {
                    title: t('receivable.totalPrice'),
                    dataIndex: 'total_price',
                    width: 100,
                    align: 'right',
                    render: (value) => formatCurrency(value),
                  },
                  {
                    title: t('receivable.orderNumber'),
                    dataIndex: 'order_number',
                    width: 120,
                    ellipsis: true,
                  },
                  { title: t('receivable.remark'), dataIndex: 'remark', ellipsis: true },
                ]}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <InvoicedModal
        visible={invoicedModalVisible}
        customerCode={selectedCustomer?.customer_code ?? null}
        customerName={selectedCustomer?.customer_short_name ?? null}
        onCancel={() => setInvoicedModalVisible(false)}
        apiInstance={apiInstance}
      />
    </>
  );
};

export default ReceivableTable;
