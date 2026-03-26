import React, { useState, useEffect } from 'react';
import { Card, Spin, Divider, message, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';

// Components
import AnalysisFilters from '@/pages/Analysis/components/AnalysisFilters';
import AnalysisConditions from '@/pages/Analysis/components/AnalysisConditions';
import AnalysisStatistics from '@/pages/Analysis/components/AnalysisStatistics';
import AnalysisDetailTable from '@/pages/Analysis/components/AnalysisDetailTable';
import AdvancedExportModal from '@/pages/Analysis/components/AdvancedExportModal';

// Hooks
import useAnalysisData from '@/pages/Analysis/hooks/useAnalysisData';
import useAnalysisExport from '@/pages/Analysis/hooks/useAnalysisExport';
import type { AnalysisType } from '@/types/analysis';

const Analysis: React.FC = () => {
  const { t } = useTranslation();

  // Custom Hooks
  const {
    loading,
    refreshing,
    customers,
    suppliers,
    products,
    analysisData,
    detailData,
    fetchFilterOptions,
    fetchAnalysisData,
    refreshAnalysisData,
  } = useAnalysisData();

  const { exporting, performNormalExport, performAdvancedExport } = useAnalysisExport();

  // Local State
  const [advancedExportModalVisible, setAdvancedExportModalVisible] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'month').startOf('month'),
    dayjs().subtract(1, 'month').endOf('month'),
  ]);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('outbound');

  // init
  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // Auto-fetch cached data
  useEffect(() => {
    if (dateRange?.[0] && dateRange?.[1]) {
      fetchAnalysisData(dateRange, selectedPartner, selectedProduct, analysisType);
    }
  }, [dateRange, selectedPartner, selectedProduct, analysisType, fetchAnalysisData]);

  const handleAnalysisTypeChange = (type: AnalysisType) => {
    setAnalysisType(type);
    setSelectedPartner(null);
    setSelectedProduct(null);
  };

  const activePartners = analysisType === 'outbound' ? customers : suppliers;

  // Export
  const handleExportAnalysis = async () => {
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
      analysisType,
    );
  };

  const handleRefreshData = async () => {
    if (!dateRange?.[0] || !dateRange?.[1]) {
      message.warning(t('analysis.selectTimeRange'));
      return;
    }

    if (!selectedPartner && !selectedProduct) {
      message.warning(t('analysis.selectFilterCondition'));
      return;
    }

    await refreshAnalysisData(dateRange, selectedPartner, selectedProduct, analysisType);
  };

  const handleAdvancedExport = async (exportType: string) => {
    setAdvancedExportModalVisible(false);
    await performAdvancedExport(exportType, dateRange, analysisType);
  };

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={2}>{t('analysis.title')}</Typography.Title>

      <Card bordered={false}>
        <AnalysisFilters
          dateRange={dateRange}
          onDateRangeChange={(dates) => setDateRange(dates as [Dayjs, Dayjs])}
          selectedPartner={selectedPartner}
          onPartnerChange={setSelectedPartner}
          selectedProduct={selectedProduct}
          onProductChange={setSelectedProduct}
          partners={activePartners}
          products={products}
          onRefresh={handleRefreshData}
          onExport={handleExportAnalysis}
          refreshing={refreshing}
          exporting={exporting}
          hasData={!!analysisData}
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

        <AdvancedExportModal
          visible={advancedExportModalVisible}
          onCancel={() => setAdvancedExportModalVisible(false)}
          onExport={(type: string) => handleAdvancedExport(type)}
          exporting={exporting}
          analysisType={analysisType}
        />
      </Card>
    </div>
  );
};

export default Analysis;
