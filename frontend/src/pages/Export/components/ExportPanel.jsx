import ExportButton from '@/components/ExportButton';
import ResponsiveDateRange from '@/components/ResponsiveDateRange';
import { Button, Col, Form, Input, Row, Space } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <section className="page-card page-card--padded">
          <h3 className="page-card-title">{t('export.statement')}</h3>
          <p className="page-card-description">{t('export.statementTip')}</p>
          <Form layout="inline" style={{ margin: '12px 0 16px' }}>
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
                  ['export.exportStatement', 'export.inboundStatement', 'export.outboundStatement'][
                    index
                  ]
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
        </section>
      </Col>
      <Col xs={24} lg={12}>
        <section className="page-card page-card--padded">
          <h3 className="page-card-title">{t('export.invoice')}</h3>
          <p className="page-card-description">{t('export.invoiceTip')}</p>
          <Form layout="inline" style={{ margin: '12px 0 16px' }}>
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
        </section>
      </Col>
      <Col span={24}>
        <section className="page-card page-card--padded">
          <h3 className="page-card-title">{t('exportPreview.shortcuts')}</h3>
          <div style={{ marginTop: 12 }}>
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
          </div>
        </section>
      </Col>
    </Row>
  );
};

export default ExportPanel;
