import { Modal, Form, Row, Col, Input, InputNumber, DatePicker, Button, Radio } from 'antd';
import type { FormInstance, RadioChangeEvent } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AutoComplete } from 'antd';
import type { FC, Dispatch, SetStateAction } from 'react';
import type { InboundFormValues, Partner, Product } from '../types';

interface InboundBatchModalProps {
  readonly modalVisible: boolean;
  readonly setModalVisible: Dispatch<SetStateAction<boolean>>;
  readonly selectedCount: number;
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
  return (valueText.includes(needle) || labelText.includes(needle)) ?? false;
};

const InboundBatchModal: FC<InboundBatchModalProps> = ({
  modalVisible,
  setModalVisible,
  selectedCount,
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
      title={`${t('inbound.batchEdit')} (${selectedCount} ${t('inbound.recordsSelected')})`}
      open={modalVisible}
      onCancel={() => setModalVisible(false)}
      footer={null}
      width={800}
    >
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          background: '#f0f2f5',
          borderRadius: 4,
        }}
      >
        <strong>Note:</strong> {t('inbound.onlyFieldsFilledWillBeUpdated')}
      </div>
      <Form<InboundFormValues> form={form} layout="vertical" onFinish={onSave}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('inbound.supplierCode')} name="supplier_code">
              <AutoComplete
                placeholder={t('inbound.inputSupplierCode') ?? ''}
                onChange={(value) => onSupplierCodeChange(value ?? '')}
                options={partners.map((partner) => ({
                  value: partner.code ?? '',
                  label: `${partner.code ?? ''} - ${partner.short_name}`,
                }))}
                filterOption={filterOption}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.supplierShortName')} name="supplier_short_name">
              <AutoComplete
                placeholder={t('inbound.inputSupplierShortName') ?? ''}
                onChange={(value) => onSupplierShortNameChange(value ?? '')}
                options={partners.map((partner) => ({
                  value: partner.short_name,
                  label: `${partner.short_name} - ${partner.code ?? ''}`,
                }))}
                filterOption={filterOption}
                allowClear
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
            <Form.Item label={t('inbound.productCode')} name="product_code">
              <AutoComplete
                placeholder={t('inbound.inputProductCode') ?? ''}
                onChange={(value) => onProductCodeChange(value ?? '')}
                options={products.map((product) => ({
                  value: product.code ?? '',
                  label: `${product.code ?? ''} - ${product.product_model}`,
                }))}
                filterOption={filterOption}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.productModel')} name="product_model">
              <AutoComplete
                placeholder={t('inbound.inputProductModel') ?? ''}
                onChange={(value) => onProductModelChange(value ?? '')}
                options={products.map((product) => ({
                  value: product.product_model,
                  label: `${product.product_model} - ${product.code ?? ''}`,
                }))}
                filterOption={filterOption}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.inboundDate')} name="inbound_date">
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('inbound.selectInboundDate') ?? ''}
                format="YYYY-MM-DD"
                onChange={(_date: Dayjs | null) => onPartnerOrProductChange()}
                allowClear
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
                {
                  type: 'number',
                  message: t('inbound.quantityGreaterThanZero'),
                },
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
              rules={[
                {
                  type: 'number',
                  message: t('inbound.priceGreaterThanZero'),
                },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder={
                  manualPrice ? (t('inbound.inputUnitPrice') ?? '') : (t('inbound.autoFetch') ?? '')
                }
                disabled={!manualPrice}
                onChange={onPriceOrQuantityChange}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('inbound.invoiceDate')} name="invoice_date">
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('inbound.selectInvoiceDate') ?? ''}
                format="YYYY-MM-DD"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.invoiceNumber')} name="invoice_number">
              <Input placeholder={t('inbound.inputInvoiceNumber') ?? ''} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('inbound.orderNumber')} name="order_number">
              <Input placeholder={t('inbound.inputOrderNumber') ?? ''} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
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
            {t('inbound.batchUpdate', { selectedCount })}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default InboundBatchModal;
