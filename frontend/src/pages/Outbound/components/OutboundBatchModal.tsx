import { Modal, Form, Row, Col, Input, InputNumber, DatePicker, Button, Radio } from 'antd';
import type { FormInstance, RadioChangeEvent } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AutoComplete } from 'antd';
import type { FC, Dispatch, SetStateAction } from 'react';
import type { OutboundFormValues, Partner, Product } from '../types';

interface OutboundBatchModalProps {
  readonly modalVisible: boolean;
  readonly setModalVisible: Dispatch<SetStateAction<boolean>>;
  readonly selectedCount: number;
  readonly form: FormInstance<OutboundFormValues>;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly manualPrice: boolean;
  readonly setManualPrice: Dispatch<SetStateAction<boolean>>;
  readonly onSave: (values: OutboundFormValues) => Promise<void> | void;
  readonly onCustomerCodeChange: (value: string) => void;
  readonly onCustomerShortNameChange: (value: string) => void;
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

const OutboundBatchModal: FC<OutboundBatchModalProps> = ({
  modalVisible,
  setModalVisible,
  selectedCount,
  form,
  partners,
  products,
  manualPrice,
  setManualPrice,
  onSave,
  onCustomerCodeChange,
  onCustomerShortNameChange,
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
      title={`${t('outbound.batchEdit')} (${selectedCount} ${t('outbound.recordsSelected')})`}
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
        <strong>Note:</strong> {t('outbound.onlyFieldsFilledWillBeUpdated')}
      </div>
      <Form<OutboundFormValues> form={form} layout="vertical" onFinish={onSave}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('outbound.customerCode')} name="customer_code">
              <AutoComplete
                placeholder={t('outbound.inputCustomerCode') ?? ''}
                onChange={(value) => onCustomerCodeChange(value ?? '')}
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
            <Form.Item label={t('outbound.customerShortName')} name="customer_short_name">
              <AutoComplete
                placeholder={t('outbound.inputCustomerShortName') ?? ''}
                onChange={(value) => onCustomerShortNameChange(value ?? '')}
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
            <Form.Item label={t('outbound.customerFullName')} name="customer_full_name">
              <Input placeholder={t('outbound.autoFill') ?? ''} disabled />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('outbound.productCode')} name="product_code">
              <AutoComplete
                placeholder={t('outbound.inputProductCode') ?? ''}
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
            <Form.Item label={t('outbound.productModel')} name="product_model">
              <AutoComplete
                placeholder={t('outbound.inputProductModel') ?? ''}
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
            <Form.Item label={t('outbound.outboundDate')} name="outbound_date">
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('outbound.selectOutboundDate') ?? ''}
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
              label={t('outbound.quantity')}
              name="quantity"
              rules={[
                {
                  type: 'number',
                  message: t('outbound.quantityGreaterThanZero'),
                },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder={t('outbound.inputQuantity') ?? ''}
                onChange={onPriceOrQuantityChange}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t('outbound.unitPriceInputType')}
              name="manual_price"
              initialValue={false}
            >
              <Radio.Group
                options={[
                  { label: t('outbound.autoFetch'), value: false },
                  { label: t('outbound.manualInput'), value: true },
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
              label={t('outbound.unitPrice')}
              name="unit_price"
              rules={[
                {
                  type: 'number',
                  message: t('outbound.priceGreaterThanZero'),
                },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder={
                  manualPrice
                    ? (t('outbound.inputUnitPrice') ?? '')
                    : (t('outbound.autoFetch') ?? '')
                }
                disabled={!manualPrice}
                onChange={onPriceOrQuantityChange}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('outbound.invoiceDate')} name="invoice_date">
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('outbound.selectInvoiceDate') ?? ''}
                format="YYYY-MM-DD"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('outbound.invoiceNumber')} name="invoice_number">
              <Input placeholder={t('outbound.inputInvoiceNumber') ?? ''} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('outbound.orderNumber')} name="order_number">
              <Input placeholder={t('outbound.inputOrderNumber') ?? ''} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('outbound.receiptNumber')} name="receipt_number">
              <Input placeholder={t('outbound.inputReceiptNumber') ?? ''} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label={t('outbound.remark')} name="remark">
          <Input.TextArea placeholder={t('outbound.inputRemark') ?? ''} rows={3} />
        </Form.Item>

        <div className="form-actions">
          <Button onClick={() => setModalVisible(false)}>{t('common.cancel')}</Button>
          <Button type="primary" htmlType="submit">
            {t('outbound.batchUpdate', { selectedCount })}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default OutboundBatchModal;
