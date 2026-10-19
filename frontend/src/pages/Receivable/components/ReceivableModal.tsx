import { useRuntimeConfig, withHistoricalOption } from '@/config/runtime';
import { useMemo, useState, type FC } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, Select, Typography, Row, Col } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { DefaultOptionType } from 'antd/es/select';
import { useTranslation } from 'react-i18next';
import type {
  Customer,
  ReceivablePaymentFormValues,
  ReceivablePaymentRecord,
  ReceivableRecord
} from '../types';

const { TextArea } = Input;
const { Text } = Typography;

interface ReceivableModalProps {
  readonly visible: boolean;
  readonly editingPayment: ReceivablePaymentRecord | null;
  readonly selectedCustomer: ReceivableRecord | null;
  readonly customers: Customer[];
  readonly form: FormInstance<ReceivablePaymentFormValues>;
  readonly onSave: (values: ReceivablePaymentFormValues) => Promise<void> | void;
  readonly onCancel: () => void;
}

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

const ReceivableModal: FC<ReceivableModalProps> = ({
  visible,
  editingPayment,
  selectedCustomer,
  customers,
  form,
  onSave,
  onCancel
}) => {
  const { t } = useTranslation();
  const {
    currency_unit_symbol,
    paymentMethods: { list: PAYMENT_METHODS, default: DEFAULT_PAYMENT_METHOD }
  } = useRuntimeConfig();
  const [submitting, setSubmitting] = useState(false);
  const amount = Form.useWatch('amount', form);

  const customerOptions = useMemo<DefaultOptionType[]>(
    () =>
      customers.map((customer) => ({
        value: customer.code,
        label: `${customer.code} - ${customer.short_name}`
      })),
    [customers]
  );

  const currentBalance = Number(selectedCustomer?.balance ?? 0);
  const enteredAmount = Number(amount ?? 0);
  const balanceAfterPayment = currentBalance - enteredAmount;
  const showRemainingHint = !editingPayment && amount !== undefined && amount !== null;

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = (await form.validateFields()) as ReceivablePaymentFormValues;
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

  const filterCustomerOption = (input: string, option?: DefaultOptionType): boolean => {
    const label = typeof option?.label === 'string' ? option.label : '';
    return label.toLowerCase().includes(input.toLowerCase());
  };

  return (
    <Modal
      title={editingPayment ? t('receivable.modalTitleEdit') : t('receivable.modalTitleAdd')}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={submitting}
      width={560}
      destroyOnHidden
    >
      {selectedCustomer && (
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
          <Text strong>{selectedCustomer.customer_short_name}</Text>
          <Text type="secondary">({selectedCustomer.customer_code})</Text>
          <span style={{ flex: 1 }} />
          <Text type="secondary">{t('receivable.balance')}:</Text>
          <Text strong style={{ color: currentBalance > 0 ? '#cf1322' : '#3f8600' }}>
            {formatCurrency(currency_unit_symbol, Math.abs(currentBalance))}
          </Text>
          {currentBalance < 0 && <Text type="success">({t('receivable.overpaidShort')})</Text>}
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
          name="customer_code"
          label={t('receivable.customerCode')}
          rules={[{ required: true, message: t('receivable.selectCustomer') }]}
          hidden={Boolean(selectedCustomer)}
        >
          <Select
            placeholder={t('receivable.selectCustomer') ?? ''}
            showSearch
            filterOption={filterCustomerOption}
            optionFilterProp="label"
            options={customerOptions}
            disabled={Boolean(selectedCustomer)}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="amount"
              label={t('receivable.paymentAmount')}
              rules={[
                { required: true, message: t('receivable.inputAmount') },
                { type: 'number', message: t('receivable.inputAmountValid') }
              ]}
            >
              <InputNumber
                placeholder={t('receivable.inputAmount') ?? ''}
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
              label={t('receivable.paymentDate')}
              rules={[{ required: true, message: t('receivable.inputDate') }]}
            >
              <DatePicker
                placeholder={t('receivable.inputDate') ?? ''}
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
                {t('receivable.remainingBalanceAfter', {
                  amount: formatCurrency(currency_unit_symbol, balanceAfterPayment)
                })}
              </Text>
            ) : (
              <Text type="warning">
                {t('receivable.overpaid', {
                  amount: formatCurrency(currency_unit_symbol, Math.abs(balanceAfterPayment))
                })}
              </Text>
            )}
          </div>
        )}
        {editingPayment && (
          <div style={{ marginTop: -12, marginBottom: 16 }}>
            <Text type="secondary">{t('receivable.editBalanceHint')}</Text>
          </div>
        )}

        <Form.Item
          name="pay_method"
          label={t('receivable.paymentMethod')}
          rules={[{ required: true, message: t('receivable.selectMethod') }]}
        >
          <Select
            placeholder={t('receivable.selectMethod') ?? ''}
            options={withHistoricalOption(PAYMENT_METHODS, editingPayment?.pay_method)}
          />
        </Form.Item>

        <Form.Item name="remark" label={t('receivable.remark')}>
          <TextArea
            placeholder={t('receivable.inputRemark') ?? ''}
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ReceivableModal;
