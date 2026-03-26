import { useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSimpleApi } from '@/hooks/useSimpleApi';
import type { Dayjs } from 'dayjs';
import type { AnalysisType, AnalysisData, DetailItem, PartnerOption } from '@/types/analysis';

export const useAnalysisExport = () => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const apiInstance = useSimpleApi();

  const performNormalExport = async (
    analysisData: AnalysisData,
    detailData: DetailItem[],
    dateRange: [Dayjs, Dayjs],
    selectedPartner: string | null,
    selectedProduct: string | null,
    partners: PartnerOption[],
    analysisType: AnalysisType,
  ) => {
    if (!analysisData) {
      message.warning(t('analysis.noDataToExport'));
      return;
    }

    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.warning(t('analysis.selectTimeRange'));
      return;
    }

    try {
      setExporting(true);

      const processedDetailData = detailData.map((item) => {
        const partnerCode = item.partner_code || item.supplier_code || item.customer_code;
        const partner = partners.find((c) => c.code === partnerCode);
        return {
          ...item,
          partner_name: partner ? partner.name : partnerCode,
        };
      });

      const requestBody = {
        analysisData,
        detailData: processedDetailData,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        partnerCode: selectedPartner && selectedPartner !== 'All' ? selectedPartner : undefined,
        productModel: selectedProduct && selectedProduct !== 'All' ? selectedProduct : undefined,
        type: analysisType,
      };

      const blob = await (apiInstance as any).postBlob('/export/analysis', requestBody);

      downloadFile(blob, `Data_Analysis_Export_${analysisType}.xlsx`);
      message.success(t('analysis.exportSuccess'));
    } catch (error: any) {
      console.error('Export failed:', error);
      message.error(error.message || t('analysis.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const performAdvancedExport = async (
    exportType: string,
    dateRange: [Dayjs, Dayjs],
    analysisType: AnalysisType,
  ) => {
    try {
      setExporting(true);

      const requestBody = {
        exportType,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        type: analysisType,
      };

      const blob = await (apiInstance as any).postBlob('/export/advanced-analysis', requestBody);

      const defaultFilename = `Advanced_Export_${analysisType}_${exportType}.xlsx`;
      downloadFile(blob, defaultFilename);
      message.success(t('analysis.exportSuccess'));
    } catch (error: any) {
      console.error('Advanced export failed:', error);
      message.error(error.message || t('analysis.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const downloadFile = (blob: Blob, defaultFilename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return {
    exporting,
    performNormalExport,
    performAdvancedExport,
  };
};

export default useAnalysisExport;
