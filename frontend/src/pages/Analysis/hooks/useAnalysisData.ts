import { useState, useCallback } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSimpleApi } from '@/hooks/useSimpleApi';
import type { Dayjs } from 'dayjs';
import type {
  AnalysisType,
  AnalysisData,
  DetailItem,
  PartnerOption,
  ProductOption,
  AnalysisApiResult
} from '@/types/analysis';

export const useAnalysisData = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<PartnerOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartnerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [detailData, setDetailData] = useState<DetailItem[]>([]);

  const { get } = useSimpleApi();

  const fetchFilterOptions = useCallback(async () => {
    try {
      setLoading(true);
      const result = (await get('/analysis/filter-options')) as AnalysisApiResult<any>;

      if (result.success) {
        setCustomers(result.customers || []);
        setSuppliers(result.suppliers || []);
        setProducts(result.products || []);
      } else {
        message.error(t('analysis.getFilterOptionsFailed'));
      }
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
      message.error(t('analysis.getFilterOptionsFailed'));
    } finally {
      setLoading(false);
    }
  }, [get, t]);

  const fetchAnalysisData = useCallback(
    async (
      dateRange: [Dayjs, Dayjs],
      selectedPartner: string | null,
      selectedProduct: string | null,
      analysisType: AnalysisType
    ) => {
      if (!dateRange || !dateRange[0] || !dateRange[1]) {
        message.warning(t('analysis.selectTimeRange'));
        return;
      }

      if (!selectedPartner && !selectedProduct) {
        setAnalysisData(null);
        setDetailData([]);
        return;
      }

      try {
        setLoading(true);

        const params = new URLSearchParams({
          start_date: dateRange[0].format('YYYY-MM-DD'),
          end_date: dateRange[1].format('YYYY-MM-DD'),
          type: analysisType
        });

        if (selectedPartner && selectedPartner !== 'All') {
          if (analysisType === 'inbound') {
            params.append('supplier_code', selectedPartner);
          } else {
            params.append('customer_code', selectedPartner);
          }
        }

        if (selectedProduct && selectedProduct !== 'All') {
          params.append('product_model', selectedProduct);
        }

        const query = params.toString();

        const [result, detailResult] = await Promise.all([
          get(`/analysis/data?${query}`) as Promise<AnalysisApiResult<AnalysisData>>,
          get(`/analysis/detail?${query}`) as Promise<AnalysisApiResult<DetailItem[]>>
        ]);

        if (result.success && result.data) {
          setAnalysisData(result.data);
        } else {
          setAnalysisData(null);
          if (result.message) {
            message.error(result.message);
          }
        }

        setDetailData(detailResult.success && detailResult.data ? detailResult.data : []);
      } catch (error) {
        console.error('Failed to fetch analysis data:', error);
        message.error(t('analysis.getAnalysisDataFailed'));
        setAnalysisData(null);
        setDetailData([]);
      } finally {
        setLoading(false);
      }
    },
    [get, t]
  );

  return {
    loading,
    customers,
    suppliers,
    products,
    analysisData,
    detailData,
    fetchFilterOptions,
    fetchAnalysisData
  };
};

export default useAnalysisData;
