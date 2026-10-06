import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AutoComplete, Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ResponsiveTable from '@/components/ResponsiveTable';
import { usePermissions } from '@/auth/usePermissions';
import { apiRequest } from '@/utils/request';

type Direction = 'inbound' | 'outbound';
type Status = 'pending' | 'approved' | 'rejected';
interface DraftIssue {
  readonly code: string;
  readonly field: string;
}
interface Draft {
  readonly id: string;
  readonly direction: Direction;
  readonly status: Status;
  readonly version: number;
  readonly partner_code: string | null;
  readonly partner_text: string | null;
  readonly product_code: string | null;
  readonly product_text: string | null;
  readonly quantity: number | null;
  readonly unit_price: number | null;
  readonly transaction_date: string | null;
  readonly invoice_date: string | null;
  readonly invoice_number: string | null;
  readonly receipt_number: string | null;
  readonly order_number: string | null;
  readonly remark: string | null;
  readonly original: Record<string, unknown> | null;
  readonly source: { readonly kind: string; readonly id: string };
  readonly source_connection_id: string | null;
  readonly last_modified_by: string | null;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly reject_reason: string | null;
  readonly approved_record_id: number | null;
  readonly request_id: string;
  readonly row_index: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly issues: DraftIssue[];
}
interface DraftResponse {
  readonly data: Draft[];
  readonly reviewEnabled: boolean;
  readonly pagination: { readonly page: number; readonly limit: number; readonly total: number; readonly pages: number };
}
interface DraftDetailResponse {
  readonly data: Draft;
}
interface Partner {
  readonly code: string;
  readonly short_name: string;
  readonly type: number | null;
}
interface Product {
  readonly code: string;
  readonly product_model: string | null;
}
interface FormValues {
  partner_code: string | null;
  partner_text: string | null;
  product_code: string | null;
  product_text: string | null;
  quantity: number | null;
  unit_price: number | null;
  transaction_date: Dayjs | null;
  invoice_date: Dayjs | null;
  invoice_number: string | null;
  receipt_number: string | null;
  order_number: string | null;
  remark: string | null;
}

const PAGE_SIZE = 20;

export default function TransactionDrafts(): React.ReactElement {
  const { t } = useTranslation();
  const { canWrite } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDirection = searchParams.get('direction') === 'outbound' ? 'outbound' : 'inbound';
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [status, setStatus] = useState<Status | ''>('pending');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [reviewEnabled, setReviewEnabled] = useState<boolean | null>(null);
  const [detail, setDetail] = useState<Draft | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [priceLookupLoading, setPriceLookupLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ direction, page: String(page), limit: String(PAGE_SIZE) });
    if (status) query.set('status', status);
    if (requestIdFilter.trim()) query.set('requestId', requestIdFilter.trim());
    if (partnerFilter.trim()) query.set('partnerCode', partnerFilter.trim());
    if (productFilter.trim()) query.set('productCode', productFilter.trim());
    if (dateRange[0]) query.set('startDate', dateRange[0].format('YYYY-MM-DD'));
    if (dateRange[1]) query.set('endDate', dateRange[1].format('YYYY-MM-DD'));
    try {
      const response = await apiRequest.get<DraftResponse>(`/transaction-drafts?${query}`);
      setDrafts(response.data);
      setTotal(response.pagination.total);
      setReviewEnabled(response.reviewEnabled);
    } catch {
      setDrafts([]);
      setTotal(0);
      message.error(t('transactionDrafts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [direction, page, status, requestIdFilter, partnerFilter, productFilter, dateRange, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setDirection(searchParams.get('direction') === 'outbound' ? 'outbound' : 'inbound');
  }, [searchParams]);
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest.get<{ data: Partner[] }>('/partners'),
      apiRequest.get<{ data: Product[] }>('/products')
    ]).then(([partnerData, productData]) => {
      if (!active) return;
      setPartners(partnerData.data);
      setProducts(productData.data);
    }).catch(() => {
      if (active) message.error(t('transactionDrafts.masterDataFailed'));
    });
    return () => { active = false; };
  }, [t]);

  const partnerOptions = useMemo(() => {
    const expectedType = direction === 'inbound' ? 0 : 1;
    return partners
      .filter((partner) => partner.type === expectedType)
      .map((partner) => ({ value: partner.code, label: `${partner.code} — ${partner.short_name}` }));
  }, [partners, direction]);
  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.code, label: `${product.code} — ${product.product_model ?? ''}` })),
    [products]
  );

  function setActiveDirection(next: Direction): void {
    setDirection(next);
    setPage(1);
    setSearchParams((params) => {
      params.set('direction', next);
      return params;
    });
  }

  async function openDetail(id: string): Promise<void> {
    setDetailLoading(true);
    setVersionConflict(false);
    try {
      const response = await apiRequest.get<DraftDetailResponse>(`/transaction-drafts/${id}`);
      setDetail(response.data);
      const row = response.data;
      form.setFieldsValue({
        partner_code: row.partner_code,
        partner_text: row.partner_text,
        product_code: row.product_code,
        product_text: row.product_text,
        quantity: row.quantity,
        unit_price: row.unit_price,
        transaction_date: row.transaction_date ? dayjs(row.transaction_date) : null,
        invoice_date: row.invoice_date ? dayjs(row.invoice_date) : null,
        invoice_number: row.invoice_number,
        receipt_number: row.receipt_number,
        order_number: row.order_number,
        remark: row.remark
      });
    } catch {
      message.error(t('transactionDrafts.detailFailed'));
    } finally {
      setDetailLoading(false);
    }
  }

  function patchFromForm(): Record<string, unknown> {
    const values = form.getFieldsValue(true) as FormValues;
    return {
      partner_code: values.partner_code || null,
      partner_text: values.partner_text || null,
      product_code: values.product_code || null,
      product_text: values.product_text || null,
      quantity: values.quantity ?? null,
      unit_price: values.unit_price ?? null,
      transaction_date: values.transaction_date?.format('YYYY-MM-DD') ?? null,
      invoice_date: values.invoice_date?.format('YYYY-MM-DD') ?? null,
      invoice_number: values.invoice_number || null,
      receipt_number: values.receipt_number || null,
      order_number: values.order_number || null,
      remark: values.remark || null
    };
  }

  async function lookupPrice(): Promise<void> {
    const values = form.getFieldsValue(true) as FormValues;
    const partner = partners.find((entry) => entry.code === values.partner_code);
    const product = products.find((entry) => entry.code === values.product_code);
    if (!partner || !product?.product_model || !values.transaction_date) {
      message.warning(t('transactionDrafts.lookupPriceMissing'));
      return;
    }
    setPriceLookupLoading(true);
    try {
      const query = new URLSearchParams({
        partner_short_name: partner.short_name,
        product_model: product.product_model,
        date: values.transaction_date.format('YYYY-MM-DD')
      });
      const response = await apiRequest.get<{ unit_price: number }>(
        `/product-prices/auto?${query}`
      );
      form.setFieldValue('unit_price', response.unit_price);
      message.success(t('transactionDrafts.lookupPriceSuccess'));
    } catch {
      message.error(t('transactionDrafts.lookupPriceFailed'));
    } finally {
      setPriceLookupLoading(false);
    }
  }

  async function saveChanges(): Promise<void> {
    if (!detail) return;
    try {
      const response = await apiRequest<DraftDetailResponse>(`/transaction-drafts/${detail.id}`, {
        method: 'PATCH',
        body: { expectedVersion: detail.version, patch: patchFromForm() }
      });
      setDetail(response.data);
      message.success(t('transactionDrafts.saveSuccess'));
      await load();
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code;
      if (code === 'VERSION_CONFLICT') {
        setVersionConflict(true);
        message.warning(t('transactionDrafts.versionConflict'));
      } else message.error(t('transactionDrafts.saveFailed'));
    }
  }

  async function approve(): Promise<void> {
    if (!detail) return;
    const values = form.getFieldsValue(true) as FormValues;
    const item = products.find((product) => product.code === values.product_code);
    const partner = partners.find((entry) => entry.code === values.partner_code);
    const totalPrice =
      typeof values.quantity === 'number' && typeof values.unit_price === 'number'
        ? (values.quantity * values.unit_price).toFixed(5)
        : '—';
    Modal.confirm({
      title: t('transactionDrafts.confirmApprove'),
      content: (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label={t('transactionDrafts.direction')}>{t(`transactionDrafts.${direction}`)}</Descriptions.Item>
          <Descriptions.Item label={t('transactionDrafts.partner')}>{partner?.short_name ?? values.partner_code ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('transactionDrafts.product')}>{item?.product_model ?? values.product_code ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('transactionDrafts.quantity')}>{values.quantity ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('transactionDrafts.unitPrice')}>{values.unit_price ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('transactionDrafts.totalPrice')}>{totalPrice}</Descriptions.Item>
          <Descriptions.Item label={t('transactionDrafts.date')}>{values.transaction_date?.format('YYYY-MM-DD') ?? '—'}</Descriptions.Item>
        </Descriptions>
      ),
      okText: t('transactionDrafts.approve'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const response = await apiRequest<{ formalRecordId: number; duplicate: boolean }>(
            `/transaction-drafts/${detail.id}/approve`,
            {
              method: 'POST',
              body: { expectedVersion: detail.version, patch: patchFromForm() }
            }
          );
          message.success(t('transactionDrafts.approveSuccess', { id: response.formalRecordId }));
          setDetail(null);
          await load();
        } catch (error) {
          const data = (error as { data?: { code?: string; issues?: DraftIssue[] } }).data;
          if (data?.code === 'VERSION_CONFLICT') {
            setVersionConflict(true);
            message.warning(t('transactionDrafts.versionConflict'));
          } else if (data?.code === 'DRAFT_NOT_READY') {
            setDetail({ ...detail, issues: data.issues ?? detail.issues });
            message.warning(t('transactionDrafts.notReady'));
          }
          else message.error(t('transactionDrafts.approveFailed'));
        }
      }
    });
  }

  async function rejectDraft(): Promise<void> {
    if (!detail || !rejectReason.trim()) return;
    try {
      await apiRequest(`/transaction-drafts/${detail.id}/reject`, {
        method: 'POST',
        body: { expectedVersion: detail.version, reason: rejectReason.trim() }
      });
      setRejectOpen(false);
      setRejectReason('');
      setDetail(null);
      message.success(t('transactionDrafts.rejectSuccess'));
      await load();
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code;
      if (code === 'VERSION_CONFLICT') {
        setVersionConflict(true);
        message.warning(t('transactionDrafts.versionConflict'));
      } else message.error(t('transactionDrafts.rejectFailed'));
    }
  }

  const columns: ColumnsType<Draft> = [
    { title: t('transactionDrafts.status'), dataIndex: 'status', key: 'status', width: 110, render: (value: Status) => <Tag color={value === 'pending' ? 'orange' : value === 'approved' ? 'green' : 'default'}>{t(`transactionDrafts.statuses.${value}`)}</Tag> },
    { title: t('transactionDrafts.partner'), key: 'partner', render: (_, row) => row.partner_text || row.partner_code || '—' },
    { title: t('transactionDrafts.product'), key: 'product', render: (_, row) => row.product_text || row.product_code || '—' },
    { title: t('transactionDrafts.quantity'), dataIndex: 'quantity', key: 'quantity', width: 90 },
    { title: t('transactionDrafts.unitPrice'), dataIndex: 'unit_price', key: 'unitPrice', width: 110, render: (value: number | null) => value ?? '—' },
    { title: t('transactionDrafts.date'), dataIndex: 'transaction_date', key: 'date', width: 120, render: (value: string | null) => value || '—' },
    { title: t('transactionDrafts.batch'), key: 'batch', render: (_, row) => <span title={row.request_id}>{`${row.request_id.slice(0, 8)} · ${row.row_index + 1}`}</span> },
    { title: t('transactionDrafts.source'), key: 'source', render: (_, row) => `${row.source.kind}: ${row.source.id}` },
    { title: t('transactionDrafts.issues'), key: 'issues', render: (_, row) => row.issues.length ? <Tag color="orange">{t('transactionDrafts.issueCount', { count: row.issues.length })}</Tag> : <Tag color="green">{t('transactionDrafts.ready')}</Tag> },
    { title: t('transactionDrafts.actions'), key: 'actions', width: 110, render: (_, row) => <Button onClick={() => void openDetail(row.id)}>{t('transactionDrafts.view')}</Button> }
  ];

  const statusOptions: Array<{ value: Status | ''; label: string }> = [
    { value: '', label: t('transactionDrafts.allStatuses') },
    ...(['pending', 'approved', 'rejected'] as const).map((value) => ({ value, label: t(`transactionDrafts.statuses.${value}`) }))
  ];
  const canReview = canWrite && reviewEnabled === true;
  const activePartner = partners.find((partner) => partner.code === detail?.partner_code);
  const activeProduct = products.find((product) => product.code === detail?.product_code);

  return (
    <Card title={<h2 style={{ margin: 0, fontSize: 18 }}>{t('transactionDrafts.title')}</h2>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Select value={direction} onChange={setActiveDirection} options={[
            { value: 'inbound', label: t('transactionDrafts.inbound') },
            { value: 'outbound', label: t('transactionDrafts.outbound') }
          ]} />
          <Select value={status} onChange={(value: Status | '') => { setStatus(value); setPage(1); }} options={statusOptions} style={{ minWidth: 150 }} />
          <Input value={requestIdFilter} onChange={(event) => setRequestIdFilter(event.target.value)} placeholder={t('transactionDrafts.batch')} allowClear style={{ width: 170 }} />
          <Input value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)} placeholder={t('transactionDrafts.partner')} allowClear style={{ width: 150 }} />
          <Input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder={t('transactionDrafts.product')} allowClear style={{ width: 150 }} />
          <DatePicker.RangePicker value={dateRange} onChange={(value) => setDateRange(value ?? [null, null])} />
          <Button onClick={() => { setPage(1); void load(); }}>{t('common.search')}</Button>
          <Button onClick={() => void load()}>{t('common.refresh')}</Button>
        </Space>
        {reviewEnabled === false && <Alert type="info" showIcon message={t('transactionDrafts.loginRequiredNotice')} />}
        {reviewEnabled === true && !canWrite && <Alert type="info" showIcon message={t('transactionDrafts.readerNotice')} />}
        <ResponsiveTable<Draft>
          rowKey="id"
          columns={columns}
          dataSource={drafts}
          loading={loading}
          pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: (next) => setPage(next) }}
        />
      </Space>

      <Modal
        title={detail ? t('transactionDrafts.reviewTitle', { id: detail.id.slice(0, 8) }) : t('transactionDrafts.reviewTitle', { id: '' })}
        open={Boolean(detail) || detailLoading}
        width={900}
        onCancel={() => setDetail(null)}
        footer={detail && <Space wrap>
          <Button onClick={() => void openDetail(detail.id)}>{t('common.refresh')}</Button>
          {canReview && detail.status === 'pending' && <>
            <Button danger onClick={() => setRejectOpen(true)}>{t('transactionDrafts.reject')}</Button>
            <Button onClick={() => void saveChanges()}>{t('common.save')}</Button>
            <Button type="primary" onClick={() => void approve()}>{t('transactionDrafts.approve')}</Button>
          </>}
        </Space>}
        confirmLoading={detailLoading}
      >
        {detail && <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label={t('transactionDrafts.status')}>{t(`transactionDrafts.statuses.${detail.status}`)} · v{detail.version}</Descriptions.Item>
            <Descriptions.Item label={t('transactionDrafts.source')}>{detail.source.kind}: {detail.source.id}</Descriptions.Item>
            <Descriptions.Item label={t('transactionDrafts.batch')}>{detail.request_id} · {detail.row_index + 1}</Descriptions.Item>
            <Descriptions.Item label={t('transactionDrafts.lastModified')}>{detail.last_modified_by ?? '—'}</Descriptions.Item>
            {detail.approved_record_id !== null && <Descriptions.Item label={t('transactionDrafts.formalRecordId')}>{detail.approved_record_id}</Descriptions.Item>}
            {detail.reject_reason && <Descriptions.Item label={t('transactionDrafts.rejectReason')}>{detail.reject_reason}</Descriptions.Item>}
          </Descriptions>
          {versionConflict && <Alert
            type="warning"
            showIcon
            message={t('transactionDrafts.versionConflict')}
            action={<Button size="small" onClick={() => void openDetail(detail.id)}>{t('transactionDrafts.reloadLatest')}</Button>}
          />}
          {detail.issues.length > 0 && <Alert type="warning" showIcon message={t('transactionDrafts.needsAttention')} description={<ul>{detail.issues.map((issue) => <li key={`${issue.field}-${issue.code}`}>{t(`transactionDrafts.issueMessages.${issue.code}`, { field: issue.field })}</li>)}</ul>} />}
          {detail.original && <details>
            <summary>{t('transactionDrafts.originalSubmission')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>{JSON.stringify(detail.original, null, 2)}</pre>
          </details>}
          <Form<FormValues> form={form} layout="vertical" disabled={!canReview || detail.status !== 'pending'}>
            <Row gutter={16}>
              <Form.Item label={t('transactionDrafts.partner')} name="partner_code" style={{ flex: 1 }}>
                <AutoComplete allowClear options={partnerOptions} filterOption placeholder={activePartner?.short_name ?? t('transactionDrafts.selectPartner')} onChange={(value) => form.setFieldValue('partner_text', partners.find((item) => item.code === value)?.short_name ?? null)} />
              </Form.Item>
              <Form.Item label={t('transactionDrafts.partnerText')} name="partner_text" style={{ flex: 1 }}><Input allowClear /></Form.Item>
            </Row>
            <Row gutter={16}>
              <Form.Item label={t('transactionDrafts.product')} name="product_code" style={{ flex: 1 }}>
                <AutoComplete allowClear options={productOptions} filterOption placeholder={activeProduct?.product_model ?? t('transactionDrafts.selectProduct')} onChange={(value) => form.setFieldValue('product_text', products.find((item) => item.code === value)?.product_model ?? null)} />
              </Form.Item>
              <Form.Item label={t('transactionDrafts.productText')} name="product_text" style={{ flex: 1 }}><Input allowClear /></Form.Item>
            </Row>
            <Row gutter={16}>
              <Form.Item label={t('transactionDrafts.quantity')} name="quantity" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} /></Form.Item>
              <Form.Item label={t('transactionDrafts.unitPrice')} style={{ flex: 1 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="unit_price" noStyle>
                    <InputNumber style={{ width: '100%' }} precision={4} />
                  </Form.Item>
                  <Button
                    disabled={!canReview || detail.status !== 'pending'}
                    loading={priceLookupLoading}
                    onClick={() => void lookupPrice()}
                  >
                    {t('transactionDrafts.lookupPrice')}
                  </Button>
                </Space.Compact>
              </Form.Item>
              <Form.Item label={t('transactionDrafts.date')} name="transaction_date" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
              <Form.Item label={t('transactionDrafts.invoiceDate')} name="invoice_date" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
            </Row>
            <Row gutter={16}>
              <Form.Item label={t('transactionDrafts.invoiceNumber')} name="invoice_number" style={{ flex: 1 }}><Input allowClear /></Form.Item>
              <Form.Item label={t('transactionDrafts.receiptNumber')} name="receipt_number" style={{ flex: 1 }}><Input allowClear /></Form.Item>
              <Form.Item label={t('transactionDrafts.orderNumber')} name="order_number" style={{ flex: 1 }}><Input allowClear /></Form.Item>
            </Row>
            <Form.Item label={t('transactionDrafts.remark')} name="remark"><Input.TextArea rows={3} showCount maxLength={2000} /></Form.Item>
          </Form>
        </Space>}
      </Modal>

      <Modal
        title={t('transactionDrafts.rejectTitle')}
        open={rejectOpen}
        onCancel={() => { setRejectOpen(false); setRejectReason(''); }}
        onOk={() => void rejectDraft()}
        okText={t('transactionDrafts.reject')}
        okButtonProps={{ danger: true, disabled: !rejectReason.trim() }}
      >
        <Input.TextArea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={2000} showCount rows={3} placeholder={t('transactionDrafts.rejectReason')} />
      </Modal>
    </Card>
  );
}
