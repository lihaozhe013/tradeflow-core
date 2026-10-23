import React, { useState } from 'react';
import dayjs from 'dayjs';
import ExportPanel from './components/ExportPanel';
import { usePermissions } from '../../auth/usePermissions';

export default function ExportPage() {
  const { hasPermission } = usePermissions();
  const [dateRange, setDateRange] = useState([dayjs().subtract(1, 'month'), dayjs()]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  return hasPermission('editor') ? (
    <ExportPanel
      dateRange={dateRange}
      setDateRange={setDateRange}
      selectedProduct={selectedProduct}
      setSelectedProduct={setSelectedProduct}
      selectedCustomer={selectedCustomer}
      setSelectedCustomer={setSelectedCustomer}
    />
  ) : null;
}
