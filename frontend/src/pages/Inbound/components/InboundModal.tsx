import { useTranslation } from 'react-i18next';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  InputNumber,
  Button,
  Row,
  Col,
  AutoComplete,
  Radio,
} from 'antd';
import type { FC, Dispatch, SetStateAction } from 'react';
import type { FormInstance } from 'antd/es/form';
import type { RadioChangeEvent } from 'antd/es/radio';
import type { DefaultOptionType } from 'antd/es/select';
import type { Dayjs } from 'dayjs';
import { currency_unit_symbol } from '@/config/types';
import type { InboundFormValues, InboundRecord, Partner, Product } from '../types';

interface InboundModalProps {
  readonly modalVisible: boolean;
  readonly setModalVisible: Dispatch<SetStateAction<boolean>>;
  readonly editingRecord: InboundRecord | null;
  readonly form: FormInstance<InboundFormValues>;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly manualPrice: boolean;
  readonly setManualPrice: Dispatch<SetStateAction<boolean>>;
  readonly onSave: (values: InboundFormValues) => Promise<void> | void;
  readonly onSupplierCodeChange: (value: string) => void;
  readonly onSupplierShortNameChange: (value: string) => void;
  readonly onProductCodeChange: (value: string) => void;
  readonly onProductModelChange: (value: string) => void;
  readonly onPartnerOrProductChange: () => void;
  readonly onPriceOrQuantityChange: () => void;
}

const filterOption = (inputValue: string, option?: DefaultOptionType): boolean => {
  const valueText = typeof option?.value === 'string' ? option.value.toLowerCase() : '';
  const labelText = typeof option?.label === 'string' ? option.label.toLowerCase() : '';
  const needle = inputValue.toLowerCase();
  return valueText.includes(needle) || labelText.includes(needle);
};

const InboundModal: FC<InboundModalProps> = ({
  modalVisible,
  setModalVisible,
  editingRecord,
  form,
  partners,
  products,
  manualPrice,
  setManualPrice,
  onSave,
  onSupplierCodeChange,
  onSupplierShortNameChange,
  onProductCodeChange,
  onProductModelChange,
  onPartnerOrProductChange,
  onPriceOrQuantityChange,
}) => {
  const { t } = useTranslation();

  const handleManualPriceChange = (event: RadioChangeEvent): void => {
    const isManual = Boolean(event.target.value);
    setManualPrice(isManual);
    if (!isManual) {
      onPartnerOrProductChange();
    }
  };

  return (
    <Modal
      title={editingRecord ? t('inbound.editInboundRecord') : t('inbound.addInboundRecord')}
      open={modalVisible}
      onCancel={() => setModalVisible(false)}
      footer={null}
      width={800}
    >
      <Form<InboundFormValues> form={form} layout="vertical" onFinish={onSave}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label={t('inbound.supplierCode')}
              name="supplier_code"
              rules={[{ required: true, message: t('inbound.inputSupplierCode') }]}
            >
              <AutoComplete
                placeholder={t('inbound.inputSupplierCode') ?? ''}
                onChange={(value) => onSupplierCodeChange(value ?? '')}
                options={partners.map((partner) => ({
                  value: partner.code ?? '',
                  label: `${partner.code ?? ''} - ${partner.short_name}`,
                }))}
                filterOption={filterOption}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t('inbound.supplierShortName')}
              name="supplier_short_name"
              rules={[{ required: true, message: t('inbound.inputSupplierShortName') }]}
            >
              <AutoComplete
                placeholder={t('inbound.inputSupplierShortName') ?? ''}
                onChange={(value) => onSupplierShortNameChange(value ?? '')}
                options={partners.map((partner) => ({
                  value: partner.short_name,
                  label: `${partner.short_name} - ${partner.code ?? ''}`,
                }))}
                filterOption={filterOption}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.supplierFullName')} name="supplier_full_name">
              <Input placeholder={t('inbound.autoFill') ?? ''} disabled />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label={t('inbound.productCode')}
              name="product_code"
              rules={[{ required: true, message: t('inbound.inputProductCode') }]}
            >
              <AutoComplete
                placeholder={t('inbound.inputProductCode') ?? ''}
                onChange={(value) => onProductCodeChange(value ?? '')}
                options={products.map((product) => ({
                  value: product.code ?? '',
                  label: `${product.code ?? ''} - ${product.product_model}`,
                }))}
                filterOption={filterOption}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t('inbound.productModel')}
              name="product_model"
              rules={[{ required: true, message: t('inbound.inputProductModel') }]}
            >
              <AutoComplete
                placeholder={t('inbound.inputProductModel') ?? ''}
                onChange={(value) => onProductModelChange(value ?? '')}
                options={products.map((product) => ({
                  value: product.product_model,
                  label: `${product.product_model} - ${product.code ?? ''}`,
                }))}
                filterOption={filterOption}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t('inbound.inboundDate')}
              name="inbound_date"
              rules={[{ required: true, message: t('inbound.selectInboundDate') }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('inbound.selectInboundDate') ?? ''}
                format="YYYY-MM-DD"
                onChange={(_date: Dayjs | null) => onPartnerOrProductChange()}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label={t('inbound.quantity')}
              name="quantity"
              rules={[
                { required: true, message: t('inbound.inputQuantity') },
                { type: 'number', message: t('inbound.quantityGreaterThanZero') },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder={t('inbound.inputQuantity') ?? ''}
                onChange={onPriceOrQuantityChange}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t('inbound.unitPriceInputType')}
              name="manual_price"
              initialValue={false}
            >
              <Radio.Group
                options={[
                  { label: t('inbound.autoFetch'), value: false },
                  { label: t('inbound.manualInput'), value: true },
                ]}
                onChange={handleManualPriceChange}
                optionType="button"
                buttonStyle="solid"
                value={manualPrice}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t('inbound.unitPrice')}
              name="unit_price"
              rules={[{ required: true, message: t('inbound.inputUnitPrice') }, { type: 'number' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder={t('inbound.inputUnitPrice') ?? ''}
                precision={4}
                addonBefore={currency_unit_symbol}
                onChange={onPriceOrQuantityChange}
                disabled={!manualPrice}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('inbound.totalPrice')} name="total_price">
              <InputNumber
                style={{ width: '100%' }}
                placeholder={t('inbound.autoCalc') ?? ''}
                precision={3}
                disabled
                addonBefore={currency_unit_symbol}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.invoiceDate')} name="invoice_date">
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('inbound.selectInvoiceDate') ?? ''}
                format="YYYY-MM-DD"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.invoiceNumber')} name="invoice_number">
              <Input placeholder={t('inbound.inputInvoiceNumber') ?? ''} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('inbound.orderNumber')} name="order_number">
              <Input placeholder={t('inbound.inputOrderNumber') ?? ''} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.receiptNumber')} name="receipt_number">
              <Input placeholder={t('inbound.inputReceiptNumber') ?? ''} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label={t('inbound.remark')} name="remark">
          <Input.TextArea placeholder={t('inbound.inputRemark') ?? ''} rows={3} />
        </Form.Item>

        <div className="form-actions">
          <Button onClick={() => setModalVisible(false)}>{t('common.cancel')}</Button>
          <Button type="primary" htmlType="submit">
            {editingRecord ? t('common.save') : t('common.add')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default InboundModal;
