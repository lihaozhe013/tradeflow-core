import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Row, Col, Button, DatePicker, Space, Form, Input, message } from 'antd';
import { DatabaseOutlined, FileExcelOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

const ExportPanel = ({
  handleExport,
  loading,
  dateRange,
  setDateRange,
  paymentDateRange,
  setPaymentDateRange,
  selectedProduct,
  setSelectedProduct,
  selectedCustomer,
  setSelectedCustomer,
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            title={
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('export.baseInfo')}</span>
            }
            size="small"
          >
            <Space wrap>
              <Button
                type="default"
                className="hover-primary"
                icon={<DatabaseOutlined />}
                onClick={() => handleExport('base-info', { tables: '123' })}
                loading={loading}
              >
                {t('export.exportAllBase')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<DatabaseOutlined />}
                onClick={() => handleExport('base-info', { tables: '1' })}
                loading={loading}
              >
                {t('export.exportPartners')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<DatabaseOutlined />}
                onClick={() => handleExport('base-info', { tables: '2' })}
                loading={loading}
              >
                {t('export.exportProducts')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<DatabaseOutlined />}
                onClick={() => handleExport('base-info', { tables: '3' })}
                loading={loading}
              >
                {t('export.exportProductPrices')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<DatabaseOutlined />}
                onClick={() => handleExport('inventory', {})}
                loading={loading}
              >
                {t('export.inventoryExport')}
              </Button>
            </Space>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {t('export.inboundOutbound')}
              </span>
            }
            size="small"
          >
            <Form layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item label={t('export.dateRange')}>
                <RangePicker value={dateRange} onChange={setDateRange} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label={t('export.productCode')}>
                <Input
                  placeholder={t('export.optional')}
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label={t('export.partnerCode')}>
                <Input
                  placeholder={t('export.optional')}
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  style={{ width: 120 }}
                />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('inbound-outbound', {
                    tables: '12',
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                    productCode: selectedProduct || undefined,
                    customerCode: selectedCustomer || undefined,
                  })
                }
                loading={loading}
              >
                {t('export.exportInboundOutbound')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('inbound-outbound', {
                    tables: '1',
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                    productCode: selectedProduct || undefined,
                    customerCode: selectedCustomer || undefined,
                  })
                }
                loading={loading}
              >
                {t('export.exportInbound')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('inbound-outbound', {
                    tables: '2',
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                    productCode: selectedProduct || undefined,
                    customerCode: selectedCustomer || undefined,
                  })
                }
                loading={loading}
              >
                {t('export.exportOutbound')}
              </Button>
            </Space>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('export.statement')}</span>
            }
            size="small"
          >
            <Form layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item label={t('export.dateRange')}>
                <RangePicker value={dateRange} onChange={setDateRange} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label={t('export.productCode')}>
                <Input
                  placeholder={t('export.optional')}
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label={t('export.partnerCode')}>
                <Input
                  placeholder={t('export.optional')}
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  style={{ width: 120 }}
                />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('statement', {
                    tables: '12',
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                    productCode: selectedProduct || undefined,
                    customerCode: selectedCustomer || undefined,
                  })
                }
                loading={loading}
              >
                {t('export.exportStatement')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('statement', {
                    tables: '1',
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                    productCode: selectedProduct || undefined,
                    customerCode: selectedCustomer || undefined,
                  })
                }
                loading={loading}
              >
                {t('export.inboundStatement')}
              </Button>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('statement', {
                    tables: '2',
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                    productCode: selectedProduct || undefined,
                    customerCode: selectedCustomer || undefined,
                  })
                }
                loading={loading}
              >
                {t('export.outboundStatement')}
              </Button>
            </Space>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              {t('export.statementTip')}
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {t('export.receivablePayable')}
              </span>
            }
            size="small"
          >
            <Form layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item label={t('export.inoutDate')}>
                <RangePicker value={dateRange} onChange={setDateRange} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label={t('export.paymentDate')}>
                <RangePicker
                  value={paymentDateRange}
                  onChange={setPaymentDateRange}
                  format="YYYY-MM-DD"
                  placeholder={[t('export.paymentStart'), t('export.paymentEnd')]}
                />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() =>
                  handleExport('receivable-payable', {
                    outboundFrom: dateRange[0].format('YYYY-MM-DD'),
                    outboundTo: dateRange[1].format('YYYY-MM-DD'),
                    paymentFrom: paymentDateRange[0].format('YYYY-MM-DD'),
                    paymentTo: paymentDateRange[1].format('YYYY-MM-DD'),
                  })
                }
                loading={loading}
              >
                {t('export.exportReceivablePayable')}
              </Button>
            </Space>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('export.invoice')}</span>
            }
            size="small"
          >
            <Form layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item label={t('export.partnerCode')} required>
                <Input
                  placeholder={t('export.required')}
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label={t('export.dateRange')} required>
                <RangePicker value={dateRange} onChange={setDateRange} format="YYYY-MM-DD" />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() => {
                  if (!selectedCustomer) {
                    message.warning(t('export.inputPartnerCode'));
                    return;
                  }
                  handleExport('invoice', {
                    partnerCode: selectedCustomer,
                    dateFrom: dateRange[0].format('YYYY-MM-DD'),
                    dateTo: dateRange[1].format('YYYY-MM-DD'),
                  });
                }}
                loading={loading}
                disabled={!selectedCustomer}
              >
                {t('export.exportInvoice')}
              </Button>
            </Space>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              {t('export.invoiceTip')}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ExportPanel;
