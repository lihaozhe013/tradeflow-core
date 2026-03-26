import { useMemo, type FC } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, Select } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { DefaultOptionType } from 'antd/es/select';
import { currency_unit_symbol } from '@/config/types';
import { useTranslation } from 'react-i18next';
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD } from '@/config';
import type {
  Customer,
  ReceivablePaymentFormValues,
  ReceivablePaymentRecord,
  ReceivableRecord,
} from '../types';

const { TextArea } = Input;

interface ReceivableModalProps {
  readonly visible: boolean;
  readonly editingPayment: ReceivablePaymentRecord | null;
  readonly selectedCustomer: ReceivableRecord | null;
  readonly customers: Customer[];
  readonly form: FormInstance<ReceivablePaymentFormValues>;
  readonly onSave: (values: ReceivablePaymentFormValues) => Promise<void> | void;
  readonly onCancel: () => void;
}

const ReceivableModal: FC<ReceivableModalProps> = ({
  visible,
  editingPayment,
  selectedCustomer,
  customers,
  form,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();

  const customerOptions = useMemo<DefaultOptionType[]>(
    () =>
      customers.map((customer) => ({
        value: customer.code,
        label: `${customer.code} - ${customer.short_name}`,
      })),
    [customers],
  );

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = (await form.validateFields()) as ReceivablePaymentFormValues;
      await onSave(values);
      form.resetFields();
    } catch (error) {
      console.error('表单验证失败:', error);
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
      width={600}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          pay_method: DEFAULT_PAYMENT_METHOD,
        }}
      >
        <Form.Item
          name="customer_code"
          label={t('receivable.customerCode')}
          rules={[{ required: true, message: t('receivable.selectCustomer') }]}
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

        <Form.Item
          name="amount"
          label={t('receivable.paymentAmount')}
          rules={[
            { required: true, message: t('receivable.inputAmount') },
            { type: 'number', message: t('receivable.inputAmountValid') },
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

        <Form.Item
          name="pay_method"
          label={t('receivable.paymentMethod')}
          rules={[{ required: true, message: t('receivable.selectMethod') }]}
        >
          <Select
            placeholder={t('receivable.selectMethod') ?? ''}
            options={PAYMENT_METHODS.map((method) => ({ value: method, label: method }))}
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
