import { useSearchParams } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Spin, Divider, message } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { LineChartOutlined } from '@ant-design/icons';

// Components
import PageHeader from '@/components/page/PageHeader';
import AnalysisFilters from '@/pages/Analysis/components/AnalysisFilters';
import AnalysisConditions from '@/pages/Analysis/components/AnalysisConditions';
import AnalysisStatistics from '@/pages/Analysis/components/AnalysisStatistics';
import AnalysisDetailTable from '@/pages/Analysis/components/AnalysisDetailTable';
import AdvancedExportModal from '@/pages/Analysis/components/AdvancedExportModal';

// Hooks
import useAnalysisData from '@/pages/Analysis/hooks/useAnalysisData';
import useAnalysisExport from '@/pages/Analysis/hooks/useAnalysisExport';
import type { AnalysisType } from '@/types/analysis';
import { usePermissions } from '@/auth/usePermissions';

const Analysis: React.FC = () => {
  const { t } = useTranslation();
  const [entryParams] = useSearchParams();
  const entryDate = (key: string, fallback: Dayjs) => {
    const value = entryParams.get(key);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).isValid()
      ? dayjs(value)
      : fallback;
  };
  const { canUseReaderPost } = usePermissions();

  // Custom Hooks
  const {
    loading,
    customers,
    suppliers,
    products,
    analysisData,
    detailData,
    fetchFilterOptions,
    fetchAnalysisData
  } = useAnalysisData();

  const { exporting, performNormalExport, performAdvancedExport } = useAnalysisExport();

  // Local State
  const [advancedExportModalVisible, setAdvancedExportModalVisible] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    entryDate('start_date', dayjs().subtract(1, 'month').startOf('month')),
    entryDate('end_date', dayjs().subtract(1, 'month').endOf('month'))
  ]);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(
    entryParams.get('customer_code') ?? 'All'
  );
  const [selectedProduct, setSelectedProduct] = useState<string | null>(
    entryParams.get('product_model') ?? 'All'
  );
  const [analysisType, setAnalysisType] = useState<AnalysisType>('outbound');

  // init
  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // Auto-fetch analysis data
  useEffect(() => {
    if (dateRange?.[0] && dateRange?.[1]) {
      fetchAnalysisData(dateRange, selectedPartner, selectedProduct, analysisType);
    }
  }, [dateRange, selectedPartner, selectedProduct, analysisType, fetchAnalysisData]);

  const handleAnalysisTypeChange = (type: AnalysisType) => {
    setAnalysisType(type);
    setSelectedPartner('All');
    setSelectedProduct('All');
  };

  const activePartners = analysisType === 'outbound' ? customers : suppliers;

  // Export
  const handleExportAnalysis = async () => {
    if (!canUseReaderPost) return;
    if (!analysisData) {
      message.warning(t('analysis.noDataToExport'));
      return;
    }

    if (!dateRange?.[0] || !dateRange?.[1]) {
      message.warning(t('analysis.selectTimeRange'));
      return;
    }

    if (
      (!selectedPartner && !selectedProduct) ||
      (selectedPartner === 'All' && selectedProduct === 'All')
    ) {
      setAdvancedExportModalVisible(true);
      return;
    }

    await performNormalExport(
      analysisData,
      detailData,
      dateRange,
      selectedPartner,
      selectedProduct,
      activePartners,
      analysisType
    );
  };

  const handleAdvancedExport = async (exportType: string) => {
    setAdvancedExportModalVisible(false);
    await performAdvancedExport(exportType, dateRange, analysisType);
  };

  return (
    <div className="page tone-violet">
      <PageHeader
        eyebrow={t('nav.finance')}
        title={t('analysis.title')}
        description={t('analysis.subtitle')}
        icon={<LineChartOutlined />}
      />

      <section className="page-card page-card--padded">
        <AnalysisFilters
          dateRange={dateRange}
          onDateRangeChange={(dates) => setDateRange(dates as [Dayjs, Dayjs])}
          selectedPartner={selectedPartner}
          onPartnerChange={setSelectedPartner}
          selectedProduct={selectedProduct}
          onProductChange={setSelectedProduct}
          partners={activePartners}
          products={products}
          onExport={handleExportAnalysis}
          exporting={exporting}
          hasData={!!analysisData}
          canUseReaderPost={canUseReaderPost}
          analysisType={analysisType}
          onAnalysisTypeChange={handleAnalysisTypeChange}
        />

        <Divider />

        <Spin spinning={loading}>
          <AnalysisConditions
            dateRange={dateRange}
            selectedPartner={selectedPartner}
            selectedProduct={selectedProduct}
            partners={activePartners}
            analysisType={analysisType}
          />

          <AnalysisStatistics data={analysisData} loading={loading} analysisType={analysisType} />

          <AnalysisDetailTable
            data={detailData}
            loading={loading}
            partners={activePartners}
            selectedPartner={selectedPartner}
            selectedProduct={selectedProduct}
            analysisType={analysisType}
          />
        </Spin>

        {canUseReaderPost && (
          <AdvancedExportModal
            visible={advancedExportModalVisible}
            onCancel={() => setAdvancedExportModalVisible(false)}
            onExport={(type: string) => handleAdvancedExport(type)}
            exporting={exporting}
            analysisType={analysisType}
          />
        )}
      </section>
    </div>
  );
};

export default Analysis;
