import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, InputNumber, DatePicker, Select } from 'antd';
import { currency_unit_symbol } from '@/config/types';
import type { FormInstance } from 'antd/es/form';
import type { DefaultOptionType } from 'antd/es/select';
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD } from '@/config';
import type {
  PayablePaymentFormValues,
  PayablePaymentRecord,
  PayableRecord,
  Supplier,
} from '../types';

const { TextArea } = Input;

interface PayableModalProps {
  readonly visible: boolean;
  readonly editingPayment: PayablePaymentRecord | null;
  readonly selectedSupplier: PayableRecord | null;
  readonly suppliers: Supplier[];
  readonly form: FormInstance<PayablePaymentFormValues>;
  readonly onSave: (values: PayablePaymentFormValues) => Promise<void> | void;
  readonly onCancel: () => void;
}

const PayableModal: FC<PayableModalProps> = ({
  visible,
  editingPayment,
  selectedSupplier,
  suppliers,
  form,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();

  const supplierOptions = useMemo<DefaultOptionType[]>(
    () =>
      suppliers.map((supplier) => ({
        value: supplier.code,
        label: `${supplier.code} - ${supplier.short_name}`,
      })),
    [suppliers],
  );

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = (await form.validateFields()) as PayablePaymentFormValues;
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
          name="supplier_code"
          label={t('payable.supplierCode')}
          rules={[{ required: true, message: t('payable.selectSupplier') }]}
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

        <Form.Item
          name="amount"
          label={t('payable.paymentAmount')}
          rules={[
            { required: true, message: t('payable.inputAmount') },
            { type: 'number', message: t('payable.inputAmountValid') },
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

        <Form.Item
          name="pay_method"
          label={t('payable.paymentMethod')}
          rules={[{ required: true, message: t('payable.selectMethod') }]}
        >
          <Select
            placeholder={t('payable.selectMethod') ?? ''}
            options={PAYMENT_METHODS.map((method) => ({ value: method, label: method }))}
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
