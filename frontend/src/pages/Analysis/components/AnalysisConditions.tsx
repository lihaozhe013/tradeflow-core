import React from 'react';
import { Alert, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import type { PartnerOption, AnalysisType } from '@/types/analysis';

interface AnalysisConditionsProps {
  dateRange: [Dayjs, Dayjs];
  selectedPartner: string | null;
  selectedProduct: string | null;
  partners: PartnerOption[];
  analysisType: AnalysisType;
}

const AnalysisConditions: React.FC<AnalysisConditionsProps> = ({
  dateRange,
  selectedPartner,
  selectedProduct,
  partners,
  analysisType,
}) => {
  const { t } = useTranslation();

  const getPartnerDisplayName = () => {
    if (!selectedPartner)
      return analysisType === 'outbound'
        ? t('analysis.allCustomers')
        : t('analysis.allSuppliers') || 'All Suppliers';
    const partner = partners.find((c) => c.code === selectedPartner);
    return partner ? partner.name : selectedPartner;
  };

  const getProductDisplayName = () => {
    if (!selectedProduct) return t('analysis.allProducts');
    return selectedProduct;
  };

  if (!dateRange?.[0] || !dateRange?.[1]) {
    return null;
  }

  return (
    <Alert
      message={
        <Space wrap>
          <span>
            <strong>{t('analysis.analysisConditions')}:</strong>
          </span>
          <Tag color="blue">
            {analysisType === 'outbound'
              ? t('analysis.sales') || 'Sales'
              : t('analysis.purchase') || 'Purchase'}
          </Tag>
          <span>
            {t('analysis.time')}: {dateRange[0].format('YYYY-MM-DD')} {t('analysis.to')}{' '}
            {dateRange[1].format('YYYY-MM-DD')}
          </span>
          <span>
            {analysisType === 'outbound'
              ? t('analysis.customer')
              : t('analysis.supplier') || 'Supplier'}
            : {getPartnerDisplayName()}
          </span>
          <span>
            {t('analysis.product')}: {getProductDisplayName()}
          </span>
        </Space>
      }
      type="info"
      style={{ marginBottom: 24 }}
    />
  );
};

export default AnalysisConditions;
