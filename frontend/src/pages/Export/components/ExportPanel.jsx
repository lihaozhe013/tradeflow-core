import ExportButton from '@/components/ExportButton';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Row, Col, Button, Space, Form, Input } from 'antd';
import ResponsiveDateRange from '@/components/ResponsiveDateRange';

const ExportPanel = ({
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
              {['12', '1', '2'].map((tables, index) => (
                <ExportButton
                  key={tables}
                  buttonLabel={t(
                    [
                      'export.exportStatement',
                      'export.inboundStatement',
                      'export.outboundStatement'
                    ][index]
                  )}
                  context={{
                    report: 'statement',
                    ids: [],
                    filters: {
                      tables,
                      dateFrom: dateRange[0].format('YYYY-MM-DD'),
                      dateTo: dateRange[1].format('YYYY-MM-DD'),
                      productCode: selectedProduct || undefined,
                      customerCode: selectedCustomer || undefined
                    }
                  }}
                />
              ))}
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
              <Form.Item label={t('export.dateRange')} required>
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
              <ExportButton
                buttonLabel={t('export.exportInvoice')}
                disabled={!invoicePartner.trim()}
                context={{
                  report: 'invoice',
                  ids: [],
                  filters: {
                    partnerCode: invoicePartner.trim(),
                    dateFrom: invoiceRange[0].format('YYYY-MM-DD'),
                    dateTo: invoiceRange[1].format('YYYY-MM-DD')
                  }
                }}
              />
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
