import PageHeader from '@/components/page/PageHeader';
import { CloudDownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExportPanel from './components/ExportPanel';
import { usePermissions } from '../../auth/usePermissions';

export default function ExportPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [dateRange, setDateRange] = useState([dayjs().subtract(1, 'month'), dayjs()]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');

  if (!hasPermission('editor')) {
    return null;
  }

  return (
    <div className="page tone-slate">
      <PageHeader
        eyebrow={t('nav.finance')}
        title={t('export.title')}
        description={t('export.subtitle')}
        icon={<CloudDownloadOutlined />}
      />
      <ExportPanel
        dateRange={dateRange}
        setDateRange={setDateRange}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
      />
    </div>
  );
}
