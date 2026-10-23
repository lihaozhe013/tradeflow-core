import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Row, Col, Button, Space, Form, Input, message } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import ResponsiveDateRange from '@/components/ResponsiveDateRange';

const ExportPanel = ({
  handleExport,
  loading,
  dateRange,
  setDateRange,
  selectedProduct,
  setSelectedProduct,
  selectedCustomer,
  setSelectedCustomer
}) => {
  const { t } = useTranslation();
  const [invoicePartner, setInvoicePartner] = useState('');
  const [invoiceRange, setInvoiceRange] = useState(dateRange);
  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('export.statement')}</span>
            }
            size="small"
          >
            <Form layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item label={t('export.dateRange')}>
                <ResponsiveDateRange
                  value={dateRange}
                  onChange={(dates) => {
                    if (dates?.[0] && dates?.[1]) setDateRange(dates);
                  }}
                  startPlaceholder={t('analysis.startDate')}
                  endPlaceholder={t('analysis.endDate')}
                />
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
                    customerCode: selectedCustomer || undefined
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
                    customerCode: selectedCustomer || undefined
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
                    customerCode: selectedCustomer || undefined
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
        <Col xs={24} lg={12}>
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
                  value={invoicePartner}
                  onChange={(e) => setInvoicePartner(e.target.value)}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label={t('export.invoiceRange')} required>
                <ResponsiveDateRange
                  value={invoiceRange}
                  onChange={(dates) => {
                    if (dates?.[0] && dates?.[1]) setInvoiceRange(dates);
                  }}
                  startPlaceholder={t('analysis.startDate')}
                  endPlaceholder={t('analysis.endDate')}
                />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button
                type="default"
                className="hover-primary"
                icon={<FileExcelOutlined />}
                onClick={() => {
                  if (!invoicePartner) {
                    message.warning(t('export.inputPartnerCode'));
                    return;
                  }
                  handleExport('invoice', {
                    partnerCode: invoicePartner,
                    dateFrom: invoiceRange[0].format('YYYY-MM-DD'),
                    dateTo: invoiceRange[1].format('YYYY-MM-DD')
                  });
                }}
                loading={loading}
                disabled={!invoicePartner}
              >
                {t('export.exportInvoice')}
              </Button>
            </Space>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              {t('export.invoiceTip')}
            </div>
          </Card>
        </Col>
        <Col span={24}>
          <Card title={t('exportPreview.shortcuts')}>
            <Space wrap>
              {[
                ['/partners', 'nav.partners'],
                ['/products', 'nav.products'],
                ['/product-prices', 'nav.productPrices'],
                ['/inbound', 'nav.inbound'],
                ['/outbound', 'nav.outbound'],
                ['/inventory', 'nav.inventory'],
                ['/receivable', 'nav.receivable'],
                ['/payable', 'nav.payable'],
                ['/analysis', 'nav.analysis']
              ].map(([path, key]) => (
                <Button key={path} href={`#${path}`}>
                  {t(key)}
                </Button>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ExportPanel;
