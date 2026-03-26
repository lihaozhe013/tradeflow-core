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
  AnalysisApiResult,
} from '@/types/analysis';

export const useAnalysisData = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customers, setCustomers] = useState<PartnerOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartnerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [detailData, setDetailData] = useState<DetailItem[]>([]);

  const { get, post } = useSimpleApi();

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
      analysisType: AnalysisType,
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
          type: analysisType,
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

        const result = (await get(
          `/analysis/data?${params.toString()}`,
        )) as AnalysisApiResult<AnalysisData>;

        if (result.success && result.data) {
          setAnalysisData(result.data);
        } else {
          setAnalysisData(null);
          if (result.status === 503) {
            message.info(t('analysis.dataNotGenerated'));
          } else if (result.message) {
            message.error(result.message);
          }
        }

        const detailResult = (await get(
          `/analysis/detail?${params.toString()}`,
        )) as AnalysisApiResult<any>;

        if (detailResult.success && detailResult.data) {
          const data = detailResult.data as any; // The structure might range from [] to {detail_data: []}
          // Backend usually returns { detail_data: [] } in cache, or [] if empty?
          // Looking at backend code:
          // GET /detail -> `data: cache[detailCacheKey]`
          // cache[detailCacheKey] stores `{ detail_data: [...], last_updated }`
          // So data is object with detail_data property.
          // BUT if not cached, it returns `data: []`?
          // Backend: `res.json({ success: true, data: [] });`

          if (Array.isArray(data)) {
            setDetailData(data);
          } else {
            setDetailData(data.detail_data || []);
          }
        } else {
          setDetailData([]);
        }
      } catch (error) {
        console.error('Failed to fetch analysis data:', error);
        message.error(t('analysis.getAnalysisDataFailed'));
        setAnalysisData(null);
        setDetailData([]);
      } finally {
        setLoading(false);
      }
    },
    [get, t],
  );

  const refreshAnalysisData = useCallback(
    async (
      dateRange: [Dayjs, Dayjs],
      selectedPartner: string | null,
      selectedProduct: string | null,
      analysisType: AnalysisType,
    ) => {
      if (!dateRange || !dateRange[0] || !dateRange[1]) {
        return;
      }

      try {
        setRefreshing(true);
        const payload: any = {
          start_date: dateRange[0].format('YYYY-MM-DD'),
          end_date: dateRange[1].format('YYYY-MM-DD'),
          product_model: selectedProduct === 'All' ? undefined : selectedProduct,
          type: analysisType,
        };

        if (selectedPartner && selectedPartner !== 'All') {
          if (analysisType === 'inbound') {
            payload.supplier_code = selectedPartner;
          } else {
            payload.customer_code = selectedPartner;
          }
        }

        const result = (await post(
          '/analysis/refresh',
          payload,
        )) as AnalysisApiResult<AnalysisData>;

        if (result.success && result.data) {
          setAnalysisData(result.data);
          message.success(t('analysis.refreshSuccess'));

          const params = new URLSearchParams({
            start_date: payload.start_date,
            end_date: payload.end_date,
            type: analysisType,
          });
          if (payload.supplier_code) params.append('supplier_code', payload.supplier_code);
          if (payload.customer_code) params.append('customer_code', payload.customer_code);
          if (payload.product_model) params.append('product_model', payload.product_model);

          const detailResult = (await get(
            `/analysis/detail?${params.toString()}`,
          )) as AnalysisApiResult<any>;
          if (detailResult.success && detailResult.data) {
            const data = detailResult.data as any;
            if (Array.isArray(data)) {
              setDetailData(data);
            } else {
              setDetailData(data.detail_data || []);
            }
          }
        } else {
          message.error(result.message || t('analysis.refreshFailed'));
        }
      } catch (error) {
        console.error('Refresh failed:', error);
        message.error(t('analysis.refreshFailed'));
      } finally {
        setRefreshing(false);
      }
    },
    [post, get, t],
  );

  return {
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
  };
};

export default useAnalysisData;
