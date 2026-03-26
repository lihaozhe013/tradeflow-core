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
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import type { TableProps } from 'antd/es/table';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { currency_unit_symbol } from '@/config/types';
import InvoicedModal from './InvoicedModal';
import type { UseSimpleApiReturn } from '@/hooks/types';
import type {
  PaginationState,
  PayableDetailResponse,
  PayableFilters,
  PayablePaymentRecord,
  PayableRecord,
  PayableSorterState,
} from '../types';

const { Search } = Input;
const { Text, Title } = Typography;

interface ModalPaginationState {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
}

interface PayableTableProps {
  readonly data: PayableRecord[];
  readonly loading: boolean;
  readonly pagination: PaginationState;
  readonly filters: PayableFilters;
  readonly sorter: PayableSorterState;
  readonly onFilter: (filters: PayableFilters) => void;
  readonly onTableChange: NonNullable<TableProps<PayableRecord>['onChange']>;
  readonly onAddPayment: (record: PayableRecord) => void;
  readonly onEditPayment: (payment: PayablePaymentRecord, supplier: PayableRecord) => void;
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

const PayableTable: FC<PayableTableProps> = ({
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
  const [selectedSupplier, setSelectedSupplier] = useState<PayableRecord | null>(null);
  const [supplierDetails, setSupplierDetails] = useState<PayableDetailResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [paymentPagination, setPaymentPagination] =
    useState<ModalPaginationState>(DEFAULT_MODAL_PAGINATION);
  const [inboundPagination, setInboundPagination] =
    useState<ModalPaginationState>(DEFAULT_MODAL_PAGINATION);
  const [invoicedModalVisible, setInvoicedModalVisible] = useState(false);

  const getBalanceTag = (balance: number | null | undefined): ReactNode => {
    const numeric = Number(balance ?? 0);
    if (numeric > 0) {
      return <Tag color="volcano">{t('payable.unpaid', { amount: formatCurrency(numeric) })}</Tag>;
    }
    if (numeric < 0) {
      return (
        <Tag color="green">
          {t('payable.overpaid', { amount: formatCurrency(Math.abs(numeric)) })}
        </Tag>
      );
    }
    return <Tag color="blue">{t('payable.paid')}</Tag>;
  };

  const fetchSupplierDetails = async (
    supplierCode: string,
    paymentPage = 1,
    inboundPage = 1,
  ): Promise<void> => {
    try {
      const inboundQuery = new URLSearchParams({
        page: String(inboundPage),
        limit: String(DEFAULT_MODAL_PAGINATION.pageSize),
      });

      // Fetch payment records from details endpoint
      const detailsResult = await apiInstance.get<PayableDetailResponse>(
        `/payable/details/${supplierCode}?payment_page=${paymentPage}&payment_limit=${DEFAULT_MODAL_PAGINATION.pageSize}`,
      );

      // Fetch uninvoiced records
      const uninvoicedResult = await apiInstance.get<{
        data: any[];
        total: number;
        page: number;
        limit: number;
      }>(`/payable/uninvoiced/${supplierCode}?${inboundQuery.toString()}`);

      const result = {
        ...detailsResult,
        inbound_records: {
          data: uninvoicedResult?.data ?? [],
          total: uninvoicedResult?.total ?? 0,
          page: uninvoicedResult?.page ?? inboundPage,
          limit: DEFAULT_MODAL_PAGINATION.pageSize,
        },
      };

      setSupplierDetails(result ?? null);

      const paymentRecords = result?.payment_records;
      if (paymentRecords) {
        setPaymentPagination({
          current: paymentRecords.page,
          pageSize: paymentRecords.limit,
          total: paymentRecords.total,
        });
      }

      const inboundRecords = result?.inbound_records;
      if (inboundRecords) {
        setInboundPagination({
          current: inboundRecords.page,
          pageSize: inboundRecords.limit,
          total: inboundRecords.total,
        });
      }
    } catch (error) {
      console.error('获取供应商详情失败:', error);
      message.error(t('payable.fetchFailedNetwork'));
    }
  };

  const handleViewDetails = async (record: PayableRecord): Promise<void> => {
    try {
      setDetailsLoading(true);
      setSelectedSupplier(record);
      setDetailsVisible(true);
      setPaymentPagination(DEFAULT_MODAL_PAGINATION);
      setInboundPagination(DEFAULT_MODAL_PAGINATION);
      await fetchSupplierDetails(record.supplier_code, 1, 1);
    } catch (error) {
      console.error('获取供应商详情失败:', error);
      message.error(t('payable.fetchFailedNetwork'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const handlePaymentPageChange = async (page: number): Promise<void> => {
    if (selectedSupplier) {
      await fetchSupplierDetails(selectedSupplier.supplier_code, page, inboundPagination.current);
    }
  };

  const handleInboundPageChange = async (page: number): Promise<void> => {
    if (selectedSupplier) {
      await fetchSupplierDetails(selectedSupplier.supplier_code, paymentPagination.current, page);
    }
  };

  const handleSearch = (value: string): void => {
    onFilter({ supplier_short_name: value || undefined });
  };

  const handleDeletePaymentConfirm = async (paymentId: number): Promise<void> => {
    await Promise.resolve(onDeletePayment(paymentId));
    if (detailsVisible && selectedSupplier) {
      await fetchSupplierDetails(
        selectedSupplier.supplier_code,
        paymentPagination.current,
        inboundPagination.current,
      );
    }
  };

  const getColumnSortOrder = (field: PayableSorterState['field']): SortOrder =>
    sorter.field === field ? (sorter.order ?? null) : null;

  const tableColumns: ColumnsType<PayableRecord> = [
    {
      title: t('payable.supplierCode'),
      dataIndex: 'supplier_code',
      key: 'supplier_code',
      width: 120,
      sorter: true,
      sortOrder: getColumnSortOrder('supplier_code'),
    },
    {
      title: t('payable.supplierShortName'),
      dataIndex: 'supplier_short_name',
      key: 'supplier_short_name',
      width: 150,
      sorter: true,
      sortOrder: getColumnSortOrder('supplier_short_name'),
    },
    {
      title: t('payable.supplierFullName'),
      dataIndex: 'supplier_full_name',
      key: 'supplier_full_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: t('payable.totalPayable'),
      dataIndex: 'total_payable',
      key: 'total_payable',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_payable'),
      render: (value) => formatCurrency(value),
    },
    {
      title: t('payable.totalPaid'),
      dataIndex: 'total_paid',
      key: 'total_paid',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_paid'),
      render: (value) => formatCurrency(value),
    },
    {
      title: t('payable.balance'),
      dataIndex: 'balance',
      key: 'balance',
      width: 130,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('balance'),
      render: (value) => getBalanceTag(value),
    },
    {
      title: t('payable.lastPaymentDate'),
      dataIndex: 'last_payment_date',
      key: 'last_payment_date',
      width: 120,
      sorter: true,
      sortOrder: getColumnSortOrder('last_payment_date'),
      render: (value) => value ?? '-',
    },
    {
      title: t('payable.lastPaymentMethod'),
      dataIndex: 'last_payment_method',
      key: 'last_payment_method',
      width: 100,
      render: (value) => value ?? '-',
    },
    {
      title: t('payable.action'),
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
            {t('payable.details')}
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddPayment(record)}
          >
            {t('payable.addPayment')}
          </Button>
        </Space>
      ),
    },
  ];

  const searchStats = useMemo(() => {
    const totalPayable = data.reduce((sum, item) => sum + (item.total_payable ?? 0), 0);
    const totalUnpaid = data.reduce((sum, item) => sum + Math.max(item.balance ?? 0, 0), 0);
    return {
      totalPayable,
      totalUnpaid,
    };
  }, [data]);

  const tablePagination: TablePaginationConfig = {
    ...pagination,
    showQuickJumper: true,
    showTotal: (total, range) =>
      t('payable.paginationTotal', { start: range[0], end: range[1], total }),
  };

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Search
            placeholder={t('payable.searchSupplier') ?? ''}
            allowClear
            onSearch={handleSearch}
            style={{ width: 250 }}
            defaultValue={filters.supplier_short_name}
          />
        </Col>
        <Col>
          <Text type="secondary">
            {t('payable.totalSuppliers', {
              count: pagination.total,
              totalPayable: formatCurrency(searchStats.totalPayable),
              totalUnpaid: formatCurrency(searchStats.totalUnpaid),
            })}
          </Text>
        </Col>
      </Row>

      <Table<PayableRecord>
        columns={tableColumns}
        dataSource={data}
        rowKey="supplier_code"
        loading={loading}
        pagination={tablePagination}
        onChange={onTableChange}
        scroll={{ x: 1200 }}
        size="middle"
      />

      <Modal
        title={`${t('payable.details')} - ${selectedSupplier?.supplier_short_name ?? ''}`}
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        footer={null}
        width={1000}
        style={{ top: 20 }}
      >
        {detailsLoading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>{t('payable.loading')}</div>
        ) : supplierDetails ? (
          <div>
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>{t('payable.supplierInfo')}</Title>
              <Row gutter={16}>
                <Col span={8}>
                  {t('payable.supplierCode')}: {supplierDetails.supplier?.code ?? '-'}
                </Col>
                <Col span={8}>
                  {t('payable.supplierShortName')}: {supplierDetails.supplier?.short_name ?? '-'}
                </Col>
                <Col span={8}>
                  {t('payable.supplierFullName')}: {supplierDetails.supplier?.full_name ?? '-'}
                </Col>
              </Row>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5}>{t('payable.summary')}</Title>
              <Row gutter={16}>
                <Col span={8}>
                  {t('payable.totalPayable')}:{' '}
                  {formatCurrency(supplierDetails.summary?.total_payable)}
                </Col>
                <Col span={8}>
                  {t('payable.totalPaid')}: {formatCurrency(supplierDetails.summary?.total_paid)}
                </Col>
                <Col span={8}>
                  {t('payable.balance')}:{getBalanceTag(supplierDetails.summary?.balance)}
                </Col>
              </Row>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5}>
                {t('payable.paymentRecords')}
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ marginLeft: 16 }}
                  onClick={() => {
                    setDetailsVisible(false);
                    if (selectedSupplier) {
                      onAddPayment(selectedSupplier);
                    }
                  }}
                >
                  {t('payable.addPayment')}
                </Button>
              </Title>
              <Table<PayablePaymentRecord>
                size="small"
                dataSource={supplierDetails.payment_records?.data ?? []}
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
                    title: t('payable.paymentAmount'),
                    dataIndex: 'amount',
                    render: (value) => formatCurrency(value),
                  },
                  { title: t('payable.paymentDate'), dataIndex: 'pay_date' },
                  { title: t('payable.paymentMethod'), dataIndex: 'pay_method' },
                  { title: t('payable.remark'), dataIndex: 'remark', ellipsis: true },
                  {
                    title: t('payable.action'),
                    width: 120,
                    render: (_value, record) => (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setDetailsVisible(false);
                            if (selectedSupplier) {
                              onEditPayment(record, selectedSupplier);
                            }
                          }}
                        >
                          {t('payable.editPayment')}
                        </Button>
                        <Popconfirm
                          title={t('payable.deletePaymentConfirm')}
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
                {t('payable.uninvoicedDetails')}
                <Button
                  type="default"
                  size="small"
                  style={{ marginLeft: 16 }}
                  onClick={() => setInvoicedModalVisible(true)}
                >
                  {t('payable.viewInvoicedDetails')}
                </Button>
              </Title>
              <Table
                size="small"
                dataSource={supplierDetails.inbound_records?.data ?? []}
                rowKey="id"
                pagination={{
                  ...inboundPagination,
                  showSizeChanger: false,
                  size: 'small',
                  onChange: handleInboundPageChange,
                  showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                }}
                scroll={{ y: 200 }}
                columns={[
                  { title: t('payable.inboundDate'), dataIndex: 'inbound_date', width: 100 },
                  { title: t('payable.productModel'), dataIndex: 'product_model', width: 120 },
                  {
                    title: t('payable.quantity'),
                    dataIndex: 'quantity',
                    width: 80,
                    align: 'right',
                  },
                  {
                    title: t('payable.unitPrice'),
                    dataIndex: 'unit_price',
                    width: 100,
                    align: 'right',
                    render: (value) => formatCurrency(value),
                  },
                  {
                    title: t('payable.totalPrice'),
                    dataIndex: 'total_price',
                    width: 100,
                    align: 'right',
                    render: (value) => formatCurrency(value),
                  },
                  {
                    title: t('payable.orderNumber'),
                    dataIndex: 'order_number',
                    width: 120,
                    ellipsis: true,
                  },
                  { title: t('payable.remark'), dataIndex: 'remark', ellipsis: true },
                ]}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <InvoicedModal
        visible={invoicedModalVisible}
        supplierCode={selectedSupplier?.supplier_code ?? null}
        supplierName={selectedSupplier?.supplier_short_name ?? null}
        onCancel={() => setInvoicedModalVisible(false)}
        apiInstance={apiInstance}
      />
    </>
  );
};

export default PayableTable;
