import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, InputNumber, DatePicker, Select, Typography, Row, Col } from 'antd';
import { currency_unit_symbol } from '@/config/types';
import type { FormInstance } from 'antd/es/form';
import type { DefaultOptionType } from 'antd/es/select';
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD } from '@/config';
import type {
  PayablePaymentFormValues,
  PayablePaymentRecord,
  PayableRecord,
  Supplier
} from '../types';

const { TextArea } = Input;
const { Text } = Typography;

interface PayableModalProps {
  readonly visible: boolean;
  readonly editingPayment: PayablePaymentRecord | null;
  readonly selectedSupplier: PayableRecord | null;
  readonly suppliers: Supplier[];
  readonly form: FormInstance<PayablePaymentFormValues>;
  readonly onSave: (values: PayablePaymentFormValues) => Promise<void> | void;
  readonly onCancel: () => void;
}

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return `${currency_unit_symbol}0.00`;
  }
  return `${currency_unit_symbol}${Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const PayableModal: FC<PayableModalProps> = ({
  visible,
  editingPayment,
  selectedSupplier,
  suppliers,
  form,
  onSave,
  onCancel
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const amount = Form.useWatch('amount', form);

  const supplierOptions = useMemo<DefaultOptionType[]>(
    () =>
      suppliers.map((supplier) => ({
        value: supplier.code,
        label: `${supplier.code} - ${supplier.short_name}`
      })),
    [suppliers]
  );

  const currentBalance = Number(selectedSupplier?.balance ?? 0);
  const enteredAmount = Number(amount ?? 0);
  const balanceAfterPayment = currentBalance - enteredAmount;
  const showRemainingHint = !editingPayment && amount !== undefined && amount !== null;

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = (await form.validateFields()) as PayablePaymentFormValues;
      setSubmitting(true);
      await onSave(values);
      form.resetFields();
    } catch (error) {
      console.error('Form validation failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (): void => {
    form.resetFields();
    onCancel();
  };

  const filterSupplierOption = (input: string, option?: DefaultOptionType): boolean => {
    const label = typeof option?.label === 'string' ? option.label : '';
    return label.toLowerCase().includes(input.toLowerCase());
  };

  return (
    <Modal
      title={editingPayment ? t('payable.modalTitleEdit') : t('payable.modalTitleAdd')}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={submitting}
      width={560}
      destroyOnHidden
    >
      {selectedSupplier && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            marginBottom: 16,
            background: '#fafafa',
            border: '1px solid #f0f0f0',
            borderRadius: 6
          }}
        >
          <Text strong>{selectedSupplier.supplier_short_name}</Text>
          <Text type="secondary">({selectedSupplier.supplier_code})</Text>
          <span style={{ flex: 1 }} />
          <Text type="secondary">{t('payable.balance')}:</Text>
          <Text
            strong
            style={{ color: currentBalance > 0 ? '#cf1322' : '#3f8600' }}
          >
            {formatCurrency(Math.abs(currentBalance))}
          </Text>
          {currentBalance < 0 && <Text type="success">({t('payable.overpaidShort')})</Text>}
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          pay_method: DEFAULT_PAYMENT_METHOD
        }}
      >
        <Form.Item
          name="supplier_code"
          label={t('payable.supplierCode')}
          rules={[{ required: true, message: t('payable.selectSupplier') }]}
          hidden={Boolean(selectedSupplier)}
        >
          <Select
            placeholder={t('payable.selectSupplier') ?? ''}
            showSearch
            filterOption={filterSupplierOption}
            optionFilterProp="label"
            options={supplierOptions}
            disabled={Boolean(selectedSupplier)}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="amount"
              label={t('payable.paymentAmount')}
              rules={[
                { required: true, message: t('payable.inputAmount') },
                { type: 'number', message: t('payable.inputAmountValid') }
              ]}
            >
              <InputNumber
                placeholder={t('payable.inputAmount') ?? ''}
                style={{ width: '100%' }}
                precision={2}
                formatter={(value) =>
                  value !== undefined && value !== null
                    ? `${currency_unit_symbol} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    : ''
                }
                parser={(value) => {
                  if (!value) return '';
                  const symbol = currency_unit_symbol ?? '';
                  // Escape regex special chars in symbol (e.g., $, ¥, €, /, etc.)
                  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  // Remove currency symbol (optionally followed by a space) and any commas
                  const re = new RegExp(`(${escaped}\\s?|,)`, 'g');
                  return value.replace(re, '');
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="pay_date"
              label={t('payable.paymentDate')}
              rules={[{ required: true, message: t('payable.inputDate') }]}
            >
              <DatePicker
                placeholder={t('payable.inputDate') ?? ''}
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
              />
            </Form.Item>
          </Col>
        </Row>

        {showRemainingHint && (
          <div style={{ marginTop: -12, marginBottom: 16 }}>
            {balanceAfterPayment >= 0 ? (
              <Text type="secondary">
                {t('payable.remainingBalanceAfter', {
                  amount: formatCurrency(balanceAfterPayment)
                })}
              </Text>
            ) : (
              <Text type="warning">
                {t('payable.overpaid', {
                  amount: formatCurrency(Math.abs(balanceAfterPayment))
                })}
              </Text>
            )}
          </div>
        )}
        {editingPayment && (
          <div style={{ marginTop: -12, marginBottom: 16 }}>
            <Text type="secondary">{t('payable.editBalanceHint')}</Text>
          </div>
        )}

        <Form.Item
          name="pay_method"
          label={t('payable.paymentMethod')}
          rules={[{ required: true, message: t('payable.selectMethod') }]}
        >
          <Select
            placeholder={t('payable.selectMethod') ?? ''}
            options={PAYMENT_METHODS.map((method) => ({
              value: method,
              label: method
            }))}
          />
        </Form.Item>

        <Form.Item name="remark" label={t('payable.remark')}>
          <TextArea
            placeholder={t('payable.inputRemark') ?? ''}
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default PayableModal;
