import { useState, useEffect, useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, message, Card, Typography, Row, Col, Divider } from 'antd';
import type { TableProps } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';
import type { UseSimpleApiReturn } from '@/hooks/types';
import ReceivableTable from '@/pages/Receivable/components/ReceivableTable';
import ReceivableModal from '@/pages/Receivable/components/ReceivableModal';
import type {
  ApiListResponse,
  Customer,
  FetchParams,
  PaginationState,
  ReceivableFilters,
  ReceivableListResponse,
  ReceivablePaymentFormValues,
  ReceivablePaymentRecord,
  ReceivableRecord,
  ReceivableSorterState,
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

const Receivable: FC = () => {
  const { t } = useTranslation();
  const [receivableRecords, setReceivableRecords] = useState<ReceivableRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState<ReceivablePaymentRecord | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<ReceivableRecord | null>(null);
  const [form] = Form.useForm<ReceivablePaymentFormValues>();
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<ReceivableFilters>({});
  const [sorter, setSorter] = useState<ReceivableSorterState>({
    field: 'balance',
    order: 'descend',
  });

  const apiInstance = useSimpleApi();
  const { data: customersResponse } = useSimpleApiData<ApiListResponse<Customer>>(
    '/partners?type=1',
    {
      data: [],
    },
  );

  const customers = useMemo<Customer[]>(() => {
    const list = customersResponse?.data;
    return Array.isArray(list) ? list : [];
  }, [customersResponse]);

  const fetchReceivableRecords = useCallback(
    async (params: FetchParams = {}) => {
      try {
        setLoading(true);
        const page = params.page ?? pagination.current;
        const limit = params.limit ?? pagination.pageSize;
        const customerName = params.customer_short_name ?? filters.customer_short_name ?? '';
        const field = params.sort_field ?? sorter.field ?? 'balance';
        const order = params.sort_order ?? toApiSortOrder(sorter.order);

        const query = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          customer_short_name: customerName ?? '',
          sort_field: field ?? 'balance',
          sort_order: order,
        });

        const result = await apiInstance.get<ReceivableListResponse>(
          `/receivable?${query.toString()}`,
        );

        setReceivableRecords(Array.isArray(result?.data) ? result.data : []);
        setPagination((prev) => ({
          ...prev,
          current: result?.page ?? page,
          total: result?.total ?? prev.total,
        }));
      } catch (error) {
        console.error('获取应收账款数据失败:', error);
        message.error(t('receivable.fetchFailedNetwork'));
        setReceivableRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [apiInstance, t, pagination, filters, sorter],
  );

  useEffect(() => {
    fetchReceivableRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pagination.current,
    pagination.pageSize,
    filters.customer_short_name,
    sorter.field,
    sorter.order,
  ]);

  const handleFilter = (filterValues: ReceivableFilters): void => {
    setFilters(filterValues);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleTableChange: TableProps<ReceivableRecord>['onChange'] = (
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
      ? (sorterConfig[0] as SorterResult<ReceivableRecord> | undefined)
      : (sorterConfig as SorterResult<ReceivableRecord> | undefined);

    if (sorterResult?.field) {
      const order = sorterResult.order as TableSortOrder | undefined;
      setSorter({ field: String(sorterResult.field), order });
    }
  };

  const handleAddPayment = (customerRecord: ReceivableRecord): void => {
    setSelectedCustomer(customerRecord);
    setEditingPayment(null);
    setModalVisible(true);
    form.resetFields();
    form.setFieldsValue({
      customer_code: customerRecord.customer_code,
      pay_date: null,
      amount: undefined,
      pay_method: undefined,
      remark: undefined,
    });
  };

  const handleEditPayment = (
    paymentRecord: ReceivablePaymentRecord,
    customerRecord: ReceivableRecord,
  ): void => {
    setSelectedCustomer(customerRecord);
    setEditingPayment(paymentRecord);
    setModalVisible(true);
    form.setFieldsValue({
      customer_code: paymentRecord.customer_code,
      amount: paymentRecord.amount,
      pay_method: paymentRecord.pay_method ?? undefined,
      remark: paymentRecord.remark ?? undefined,
      pay_date: paymentRecord.pay_date ? dayjs(paymentRecord.pay_date) : null,
    });
  };

  const handleSavePayment = async (values: ReceivablePaymentFormValues): Promise<void> => {
    try {
      const payload = {
        ...values,
        pay_date: values.pay_date ? values.pay_date.format('YYYY-MM-DD') : null,
      };

      if (editingPayment) {
        await apiInstance.put(`/receivable/payments/${editingPayment.id}`, payload);
      } else {
        await apiInstance.post('/receivable/payments', payload);
      }

      message.success(
        t('receivable.saveSuccess', {
          action: editingPayment ? t('common.edit') : t('common.add'),
        }),
      );
      setModalVisible(false);
      fetchReceivableRecords();
    } catch (error) {
      console.error('保存回款记录失败:', error);
      message.error(t('receivable.saveFailed'));
    }
  };

  const handleDeletePayment = async (paymentId: number): Promise<void> => {
    try {
      await apiInstance.delete(`/receivable/payments/${paymentId}`);
      message.success(t('receivable.deleteSuccess'));
      fetchReceivableRecords();
    } catch (error) {
      console.error('删除回款记录失败:', error);
      message.error(t('receivable.deleteFailed'));
    }
  };

  const handleRefresh = (): void => {
    fetchReceivableRecords();
    message.success(t('receivable.dataRefreshed'));
  };

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t('receivable.title')}
            </Title>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              style={{ marginRight: 8 }}
            >
              {t('receivable.refresh')}
            </Button>
          </Col>
        </Row>

        <Divider />

        <ReceivableTable
          data={receivableRecords}
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

        <ReceivableModal
          visible={modalVisible}
          editingPayment={editingPayment}
          selectedCustomer={selectedCustomer}
          customers={customers}
          form={form}
          onSave={handleSavePayment}
          onCancel={() => setModalVisible(false)}
        />
      </Card>
    </div>
  );
};

export default Receivable;
