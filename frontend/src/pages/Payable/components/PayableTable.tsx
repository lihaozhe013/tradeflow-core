import { useRuntimeConfig } from '@/config/runtime';
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
import type { SortOrder } from 'antd/es/table/interface';
import type { TableProps } from 'antd/es/table';
import { PlusOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UseSimpleApiReturn } from '@/hooks/types';
import type {
  PaginationState,
  PayableDetailResponse,
  PayableFilters,
  PayableInboundRecord,
  PayablePaymentRecord,
  PayableRecord,
  PayableSorterState
} from '../types';

const { Search } = Input;

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
  readonly canWrite: boolean;
}

const DEFAULT_MODAL_PAGINATION: ModalPaginationState = {
  current: 1,
  pageSize: 5,
  total: 0
};

const formatCurrency = (
  currency_unit_symbol: string,
  amount: number | null | undefined
): string => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return `${currency_unit_symbol}0.00`;
  }
  return `${currency_unit_symbol}${Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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
  canWrite
}) => {
  const { t } = useTranslation();
  const { currency_unit_symbol } = useRuntimeConfig();
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<PayableRecord | null>(null);
  const [supplierDetails, setSupplierDetails] = useState<PayableDetailResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [paymentPagination, setPaymentPagination] =
    useState<ModalPaginationState>(DEFAULT_MODAL_PAGINATION);
  const [inboundPagination, setInboundPagination] =
    useState<ModalPaginationState>(DEFAULT_MODAL_PAGINATION);
  const [detailsTab, setDetailsTab] = useState('payments');

  const getBalanceTag = (balance: number | null | undefined): ReactNode => {
    const numeric = Number(balance ?? 0);
    if (numeric > 0) {
      return (
        <Tag color="volcano">
          {t('payable.unpaid', { amount: formatCurrency(currency_unit_symbol, numeric) })}
        </Tag>
      );
    }
    if (numeric < 0) {
      return (
        <Tag color="green">
          {t('payable.overpaid', {
            amount: formatCurrency(currency_unit_symbol, Math.abs(numeric))
          })}
        </Tag>
      );
    }
    return <Tag color="blue">{t('payable.paid')}</Tag>;
  };

  const fetchSupplierDetails = async (
    supplierCode: string,
    paymentPage = 1,
    inboundPage = 1
  ): Promise<void> => {
    try {
      const inboundQuery = new URLSearchParams({
        page: String(inboundPage),
        limit: String(DEFAULT_MODAL_PAGINATION.pageSize)
      });

      // Fetch payment records from details endpoint
      const detailsResult = await apiInstance.get<PayableDetailResponse>(
        `/payable/details/${supplierCode}?payment_page=${paymentPage}&payment_limit=${DEFAULT_MODAL_PAGINATION.pageSize}`
      );

      // Fetch uninvoiced records
      const uninvoicedResult = await apiInstance.get<{
        data: PayableInboundRecord[];
        total: number;
        page: number;
        limit: number;
      }>(`/payable/uninvoiced/${supplierCode}?${inboundQuery.toString()}`);

      const result: PayableDetailResponse = {
        ...detailsResult,
        inbound_records: {
          data: uninvoicedResult?.data ?? [],
          total: uninvoicedResult?.total ?? 0,
          page: uninvoicedResult?.page ?? inboundPage,
          limit: uninvoicedResult?.limit ?? DEFAULT_MODAL_PAGINATION.pageSize
        }
      };

      setSupplierDetails(result);

      const paymentRecords = result.payment_records;
      if (paymentRecords) {
        setPaymentPagination({
          current: paymentRecords.page,
          pageSize: paymentRecords.limit,
          total: paymentRecords.total
        });
      }

      const inboundRecords = result.inbound_records;
      if (inboundRecords) {
        setInboundPagination({
          current: inboundRecords.page,
          pageSize: inboundRecords.limit,
          total: inboundRecords.total
        });
      }
    } catch (error) {
      console.error('Failed to fetch supplier details:', error);
      message.error(t('payable.fetchFailedNetwork'));
    }
  };

  const handleViewDetails = async (record: PayableRecord): Promise<void> => {
    setDetailsLoading(true);
    setSelectedSupplier(record);
    setDetailsVisible(true);
    setPaymentPagination(DEFAULT_MODAL_PAGINATION);
    setInboundPagination(DEFAULT_MODAL_PAGINATION);
    try {
      await fetchSupplierDetails(record.supplier_code, 1, 1);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Keep the open details modal in sync after the list refreshes (for example
  // when a payment is saved or deleted from the payment modal above it) and
  // bring the payment records tab back into view so the change is visible.
  useEffect(() => {
    if (detailsVisible && selectedSupplier) {
      void fetchSupplierDetails(
        selectedSupplier.supplier_code,
        paymentPagination.current,
        inboundPagination.current
      );
      setDetailsTab('payments');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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
        inboundPagination.current
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
      sortOrder: getColumnSortOrder('supplier_code')
    },
    {
      title: t('payable.supplierShortName'),
      dataIndex: 'supplier_short_name',
      key: 'supplier_short_name',
      width: 150,
      sorter: true,
      sortOrder: getColumnSortOrder('supplier_short_name')
    },
    {
      title: t('payable.totalPayable'),
      dataIndex: 'total_payable',
      key: 'total_payable',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_payable'),
      render: (value) => formatCurrency(currency_unit_symbol, value)
    },
    {
      title: t('payable.totalPaid'),
      dataIndex: 'total_paid',
      key: 'total_paid',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('total_paid'),
      render: (value) => formatCurrency(currency_unit_symbol, value)
    },
    {
      title: t('payable.balance'),
      dataIndex: 'balance',
      key: 'balance',
      width: 130,
      align: 'right',
      sorter: true,
      sortOrder: getColumnSortOrder('balance'),
      render: (value) => getBalanceTag(value)
    },
    {
      title: t('payable.lastPaymentDate'),
      dataIndex: 'last_payment_date',
      key: 'last_payment_date',
      width: 120,
      sorter: true,
      sortOrder: getColumnSortOrder('last_payment_date'),
      render: (value) => value ?? '-'
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
          {canWrite && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddPayment(record)}
            >
              {t('payable.addPayment')}
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
      t('payable.paginationTotal', { start: range[0], end: range[1], total })
  };

  const detailsTabs = [
    {
      key: 'payments',
      label: t('payable.paymentRecords'),
      children: (
        <ResponsiveTable<PayablePaymentRecord>
          size="small"
          dataSource={supplierDetails?.payment_records?.data ?? []}
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
              title: t('payable.paymentAmount'),
              dataIndex: 'amount',
              render: (value) => formatCurrency(currency_unit_symbol, value)
            },
            { title: t('payable.paymentDate'), dataIndex: 'pay_date' },
            {
              title: t('payable.paymentMethod'),
              dataIndex: 'pay_method'
            },
            {
              title: t('payable.remark'),
              dataIndex: 'remark',
              ellipsis: true
            },
            ...(canWrite
              ? [
                  {
                    title: t('payable.action'),
                    width: 120,
                    render: (_value: unknown, record: PayablePaymentRecord) => (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
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
      label: t('payable.uninvoicedDetails'),
      children: (
        <ResponsiveTable
          size="small"
          dataSource={supplierDetails?.inbound_records?.data ?? []}
          rowKey="id"
          pagination={{
            ...inboundPagination,
            showSizeChanger: false,
            size: 'small',
            onChange: handleInboundPageChange,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`
          }}
          scroll={{ y: 260 }}
          columns={[
            {
              title: t('payable.inboundDate'),
              dataIndex: 'inbound_date',
              width: 100
            },
            {
              title: t('payable.productModel'),
              dataIndex: 'product_model',
              width: 120
            },
            {
              title: t('payable.quantity'),
              dataIndex: 'quantity',
              width: 80,
              align: 'right'
            },
            {
              title: t('payable.unitPrice'),
              dataIndex: 'unit_price',
              width: 100,
              align: 'right',
              render: (value) => formatCurrency(currency_unit_symbol, value)
            },
            {
              title: t('payable.totalPrice'),
              dataIndex: 'total_price',
              width: 100,
              align: 'right',
              render: (value) => formatCurrency(currency_unit_symbol, value)
            },
            {
              title: t('payable.orderNumber'),
              dataIndex: 'order_number',
              width: 120,
              ellipsis: true
            },
            {
              title: t('payable.remark'),
              dataIndex: 'remark',
              ellipsis: true
            }
          ]}
        />
      )
    },
    {
      key: 'invoiced',
      label: t('payable.invoicedDetails'),
      children: (
        <InvoicedSnapshotPanel
          direction="payable"
          partnerCode={selectedSupplier?.supplier_code ?? null}
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
            placeholder={t('payable.searchSupplier') ?? ''}
            allowClear
            onSearch={handleSearch}
            style={{ width: 250 }}
            defaultValue={filters.supplier_short_name}
          />
        </Col>
      </Row>

      <ResponsiveTable<PayableRecord>
        columns={tableColumns}
        dataSource={data}
        rowKey="supplier_code"
        loading={loading}
        pagination={tablePagination}
        onChange={onTableChange}
        scroll={{ x: 960 }}
        size="medium"
      />

      <Modal
        title={`${t('payable.details')} - ${selectedSupplier?.supplier_short_name ?? ''}`}
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        width={1000}
        style={{ top: 20 }}
        destroyOnHidden
        footer={
          <Space>
            {canWrite && selectedSupplier && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => onAddPayment(selectedSupplier)}
              >
                {t('payable.addPayment')}
              </Button>
            )}
            <Button onClick={() => setDetailsVisible(false)}>{t('payable.close')}</Button>
          </Space>
        }
      >
        {detailsLoading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin />
          </div>
        ) : supplierDetails ? (
          <div>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, md: 3 }}
              title={t('payable.supplierInfo')}
              style={{ marginBottom: 16 }}
              items={[
                {
                  key: 'code',
                  label: t('payable.supplierCode'),
                  children: supplierDetails.supplier?.code ?? '-'
                },
                {
                  key: 'short_name',
                  label: t('payable.supplierShortName'),
                  children: supplierDetails.supplier?.short_name ?? '-'
                },
                {
                  key: 'full_name',
                  label: t('payable.supplierFullName'),
                  children: supplierDetails.supplier?.full_name ?? '-'
                }
              ]}
            />

            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              {t('payable.summary')}
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
                title={t('payable.totalPayable')}
                value={supplierDetails.summary?.total_payable ?? 0}
                precision={2}
                prefix={currency_unit_symbol}
              />
              <Statistic
                title={t('payable.totalPaid')}
                value={supplierDetails.summary?.total_paid ?? 0}
                precision={2}
                prefix={currency_unit_symbol}
                valueStyle={{ color: '#3f8600' }}
              />
              <Statistic
                title={t('payable.balance')}
                value={Math.abs(Number(supplierDetails.summary?.balance ?? 0))}
                precision={2}
                prefix={currency_unit_symbol}
                valueStyle={{
                  color: Number(supplierDetails.summary?.balance ?? 0) > 0 ? '#cf1322' : '#3f8600'
                }}
                suffix={getBalanceTag(supplierDetails.summary?.balance)}
              />
            </div>

            <Tabs
              defaultActiveKey="payments"
              activeKey={detailsTab}
              onChange={setDetailsTab}
              items={detailsTabs}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default PayableTable;
