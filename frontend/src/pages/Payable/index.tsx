import { useState, useEffect, useCallback, useMemo, type FC } from 'react';
import { Button, Form, message, Card, Typography, Row, Col, Divider } from 'antd';
import type { TableProps } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import { useTranslation } from 'react-i18next';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';
import type { UseSimpleApiReturn } from '@/hooks/types';
import PayableTable from '@/pages/Payable/components/PayableTable';
import PayableModal from '@/pages/Payable/components/PayableModal';
import type {
  ApiListResponse,
  FetchParams,
  PaginationState,
  PayableFilters,
  PayableListResponse,
  PayablePaymentFormValues,
  PayablePaymentRecord,
  PayableRecord,
  PayableSorterState,
  Supplier,
  TableSortOrder,
} from './types';

const { Title } = Typography;

const DEFAULT_PAGINATION: PaginationState = {
  current: 1,
  pageSize: 10,
  total: 0,
};

const toApiSortOrder = (order?: TableSortOrder): 'asc' | 'desc' => {
  if (order === 'ascend') {
    return 'asc';
  }
  return 'desc';
};

const Payable: FC = () => {
  const { t } = useTranslation();
  const [payableRecords, setPayableRecords] = useState<PayableRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PayablePaymentRecord | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<PayableRecord | null>(null);
  const [form] = Form.useForm<PayablePaymentFormValues>();
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<PayableFilters>({});
  const [sorter, setSorter] = useState<PayableSorterState>({ field: 'balance', order: 'descend' });

  const apiInstance = useSimpleApi();
  const { data: suppliersResponse } = useSimpleApiData<ApiListResponse<Supplier>>(
    '/partners?type=0',
    {
      data: [],
    },
  );

  const suppliers = useMemo<Supplier[]>(() => {
    const list = suppliersResponse?.data;
    return Array.isArray(list) ? list : [];
  }, [suppliersResponse]);

  const fetchPayableRecords = useCallback(
    async (params: FetchParams = {}) => {
      try {
        setLoading(true);
        const page = params.page ?? pagination.current;
        const limit = params.limit ?? pagination.pageSize;
        const supplierName = params.supplier_short_name ?? filters.supplier_short_name ?? '';
        const field = params.sort_field ?? sorter.field ?? 'balance';
        const order = params.sort_order ?? toApiSortOrder(sorter.order);

        const query = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          supplier_short_name: supplierName ?? '',
          sort_field: field ?? 'balance',
          sort_order: order,
        });

        const result = await apiInstance.get<PayableListResponse>(`/payable?${query.toString()}`);

        setPayableRecords(Array.isArray(result?.data) ? result.data : []);
        setPagination((prev) => ({
          ...prev,
          current: result?.page ?? page,
          total: result?.total ?? prev.total,
        }));
      } catch (error) {
        console.error('获取应付账款数据失败:', error);
        message.error(t('payable.fetchFailedNetwork'));
        setPayableRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [apiInstance, t, pagination, filters, sorter],
  );

  useEffect(() => {
    fetchPayableRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pagination.current,
    pagination.pageSize,
    filters.supplier_short_name,
    sorter.field,
    sorter.order,
  ]);

  const handleFilter = (filterValues: PayableFilters): void => {
    setFilters(filterValues);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleTableChange: TableProps<PayableRecord>['onChange'] = (
    paginationConfig,
    _filtersConfig,
    sorterConfig,
  ) => {
    setPagination((prev) => ({
      ...prev,
      current: paginationConfig.current ?? prev.current,
      pageSize: DEFAULT_PAGINATION.pageSize,
    }));

    const sorterResult = Array.isArray(sorterConfig)
      ? (sorterConfig[0] as SorterResult<PayableRecord> | undefined)
      : (sorterConfig as SorterResult<PayableRecord> | undefined);

    if (sorterResult?.field) {
      const order = sorterResult.order as TableSortOrder | undefined;
      setSorter({ field: String(sorterResult.field), order });
    }
  };

  const handleAddPayment = (supplierRecord: PayableRecord): void => {
    setSelectedSupplier(supplierRecord);
    setEditingPayment(null);
    setModalVisible(true);
    form.resetFields();
    form.setFieldsValue({
      supplier_code: supplierRecord.supplier_code,
      pay_date: null,
      amount: undefined,
      pay_method: undefined,
      remark: undefined,
    });
  };

  const handleEditPayment = (
    paymentRecord: PayablePaymentRecord,
    supplierRecord: PayableRecord,
  ): void => {
    setSelectedSupplier(supplierRecord);
    setEditingPayment(paymentRecord);
    setModalVisible(true);
    form.setFieldsValue({
      supplier_code: paymentRecord.supplier_code,
      amount: paymentRecord.amount,
      pay_method: paymentRecord.pay_method ?? undefined,
      remark: paymentRecord.remark ?? undefined,
      pay_date: paymentRecord.pay_date ? dayjs(paymentRecord.pay_date) : null,
    });
  };

  const handleSavePayment = async (values: PayablePaymentFormValues): Promise<void> => {
    try {
      const payload = {
        ...values,
        pay_date: values.pay_date ? values.pay_date.format('YYYY-MM-DD') : null,
      };

      if (editingPayment) {
        await apiInstance.put(`/payable/payments/${editingPayment.id}`, payload);
      } else {
        await apiInstance.post('/payable/payments', payload);
      }

      message.success(
        t('payable.saveSuccess', {
          action: editingPayment ? t('payable.editPayment') : t('payable.addPayment'),
        }),
      );
      setModalVisible(false);
      fetchPayableRecords();
    } catch (error) {
      console.error('保存付款记录失败:', error);
      message.error(t('payable.saveFailed'));
    }
  };

  const handleDeletePayment = async (paymentId: number): Promise<void> => {
    try {
      await apiInstance.delete(`/payable/payments/${paymentId}`);
      message.success(t('payable.deleteSuccess'));
      fetchPayableRecords();
    } catch (error) {
      console.error('删除付款记录失败:', error);
      message.error(t('payable.deleteFailed'));
    }
  };

  const handleRefresh = (): void => {
    fetchPayableRecords();
    message.success(t('payable.dataRefreshed'));
  };

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t('payable.title')}
            </Title>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              style={{ marginRight: 8 }}
            >
              {t('payable.refresh')}
            </Button>
          </Col>
        </Row>

        <Divider />

        <PayableTable
          data={payableRecords}
          loading={loading}
          pagination={pagination}
          filters={filters}
          sorter={sorter}
          onFilter={handleFilter}
          onTableChange={handleTableChange}
          onAddPayment={handleAddPayment}
          onEditPayment={handleEditPayment}
          onDeletePayment={handleDeletePayment}
          apiInstance={apiInstance as UseSimpleApiReturn}
        />

        <PayableModal
          visible={modalVisible}
          editingPayment={editingPayment}
          selectedSupplier={selectedSupplier}
          suppliers={suppliers}
          form={form}
          onSave={handleSavePayment}
          onCancel={() => setModalVisible(false)}
        />
      </Card>
    </div>
  );
};

export default Payable;
