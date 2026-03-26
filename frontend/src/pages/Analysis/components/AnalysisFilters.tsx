import React from 'react';
import { Row, Col, DatePicker, AutoComplete, Button, Space, Segmented } from 'antd';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import type { PartnerOption, ProductOption, AnalysisType } from '@/types/analysis';

const { RangePicker } = DatePicker;

interface AnalysisFiltersProps {
  dateRange: [Dayjs, Dayjs];
  onDateRangeChange: (
    dates: [Dayjs | null, Dayjs | null] | null,
    dateStrings: [string, string],
  ) => void;
  selectedPartner: string | null;
  onPartnerChange: (value: string | null) => void;
  selectedProduct: string | null;
  onProductChange: (value: string | null) => void;
  partners: PartnerOption[];
  products: ProductOption[];
  onRefresh: () => void;
  onExport: () => void;
  refreshing: boolean;
  exporting: boolean;
  hasData: boolean;
  analysisType: AnalysisType;
  onAnalysisTypeChange: (type: AnalysisType) => void;
}

const AnalysisFilters: React.FC<AnalysisFiltersProps> = ({
  dateRange,
  onDateRangeChange,
  selectedPartner,
  onPartnerChange,
  selectedProduct,
  onProductChange,
  partners,
  products,
  onRefresh,
  onExport,
  refreshing,
  exporting,
  hasData,
  analysisType,
  onAnalysisTypeChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Row style={{ marginBottom: 16 }}>
        <Col>
          <Space size="large">
            <Space>
              <strong>{t('analysis.type')}:</strong>
              <Segmented
                options={[
                  { label: t('analysis.sales') || 'Outbound (Sales)', value: 'outbound' },
                  { label: t('analysis.purchase') || 'Inbound (Purchase)', value: 'inbound' },
                ]}
                value={analysisType}
                onChange={(val) => onAnalysisTypeChange(val as AnalysisType)}
              />
            </Space>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <div style={{ marginBottom: 8 }}>
            <strong>{t('analysis.timeRange')}</strong>
          </div>
          <RangePicker
            value={dateRange}
            onChange={onDateRangeChange}
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            placeholder={[t('analysis.startDate'), t('analysis.endDate')]}
          />
        </Col>

        <Col xs={24} sm={12} md={8}>
          <div style={{ marginBottom: 8 }}>
            <strong>
              {analysisType === 'outbound'
                ? t('analysis.customer')
                : t('analysis.supplier') || 'Supplier'}
            </strong>
          </div>
          <AutoComplete
            value={selectedPartner}
            onChange={onPartnerChange}
            style={{ width: '100%' }}
            placeholder={
              analysisType === 'outbound'
                ? t('analysis.selectCustomer')
                : t('analysis.selectSupplier') || 'Select Supplier'
            }
            options={partners.map((p) => ({
              value: p.code,
              label: `${p.code} - ${p.name}`,
            }))}
            filterOption={(inputValue, option) =>
              (option?.label ?? '').toLowerCase().includes(inputValue.toLowerCase())
            }
            allowClear
          />
        </Col>

        <Col xs={24} sm={12} md={8}>
          <div style={{ marginBottom: 8 }}>
            <strong>{t('analysis.product')}</strong>
          </div>
          <AutoComplete
            value={selectedProduct}
            onChange={onProductChange}
            style={{ width: '100%' }}
            placeholder={t('analysis.selectProduct')}
            options={products.map((product) => ({
              value: product.model,
              label: `${product.model} - ${product.name}`,
            }))}
            filterOption={(inputValue, option) =>
              (option?.label ?? '').toLowerCase().includes(inputValue.toLowerCase())
            }
            allowClear
          />
        </Col>
      </Row>

      <Row style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={onRefresh}
              loading={refreshing}
            >
              {t('analysis.refreshData')}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={onExport}
              loading={exporting}
              disabled={!hasData}
            >
              {t('analysis.exportData')}
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default AnalysisFilters;
