import React, { useState } from 'react';
import { Card, Typography, Row, Col, message, Tabs, Button } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSimpleApi } from '../../hooks/useSimpleApi';
import ExportPanel from './components/ExportPanel';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;
const { TabPane } = Tabs;

const Report = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([dayjs().subtract(1, 'month'), dayjs()]);
  const [paymentDateRange, setPaymentDateRange] = useState([dayjs().subtract(1, 'month'), dayjs()]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');

  const { t } = useTranslation();
  const apiInstance = useSimpleApi();
  // 生成文件名
  const generateFilename = (exportType) => {
    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const typeMap = {
      'base-info': t('export.baseInfo'),
      'inbound-outbound': t('export.inboundOutbound'),
      statement: t('export.statement'),
      'receivable-payable': t('export.receivablePayable'),
      invoice: t('export.invoice'),
      inventory: t('export.inventoryExport'),
    };
    const typeName = typeMap[exportType] || exportType;
    return `${typeName}_${timestamp}.xlsx`;
  };

  // Node.js导出功能 - 直接下载
  const handleExport = async (exportType, params) => {
    try {
      setLoading(true);
      message.loading(t('export.generating'), 0.5);

      const blob = await apiInstance.postBlob(`/export/${exportType}`, params);

      // 检查文件大小
      if (blob.size === 0) {
        message.warning(t('export.emptyFile'));
        return;
      }

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = generateFilename(exportType);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const fileSizeKB = (blob.size / 1024).toFixed(1);
      message.success(t('export.success', { size: fileSizeKB }));
    } catch (error) {
      console.error(t('export.failed'), error);
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        message.error(t('export.networkError'));
      } else {
        message.error(t('export.failed', { msg: error.message }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <ExportPanel
        handleExport={handleExport}
        loading={loading}
        dateRange={dateRange}
        setDateRange={setDateRange}
        paymentDateRange={paymentDateRange}
        setPaymentDateRange={setPaymentDateRange}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
      />
    </div>
  );
};

export default Report;
