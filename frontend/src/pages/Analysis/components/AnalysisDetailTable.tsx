import React from 'react';
import { Table, Card } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DetailItem, PartnerOption, AnalysisType } from '@/types/analysis';

interface AnalysisDetailTableProps {
  data: DetailItem[];
  loading: boolean;
  partners: PartnerOption[]; // Customers or Suppliers
  selectedPartner: string | null; // code
  selectedProduct: string | null;
  analysisType: AnalysisType;
}

const AnalysisDetailTable: React.FC<AnalysisDetailTableProps> = ({
  data,
  loading,
  partners,
  selectedPartner,
  selectedProduct: _selectedProduct,
  analysisType,
}) => {
  const { t } = useTranslation();

  // Helper to get partner name
  const getPartnerName = (code: string) => {
    const p = partners.find((item) => item.code === code);
    return p ? `${p.name}` : code;
  };

  // Define columns based on type
  const getColumns = () => {
    const commonColumns = [];

    const isGroupedByPartner = !selectedPartner || selectedPartner === 'All';

    if (isGroupedByPartner) {
      commonColumns.push({
        title:
          analysisType === 'outbound'
            ? t('analysis.customer')
            : t('analysis.supplier') || 'Supplier',
        dataIndex: 'group_key',
        key: 'group_key',
        render: (text: string) => getPartnerName(text),
      });
    } else {
      commonColumns.push({
        title: t('analysis.product'),
        dataIndex: 'group_key',
        key: 'group_key',
      });
    }

    if (analysisType === 'inbound') {
      return [
        ...commonColumns,
        {
          title: t('analysis.purchaseAmount') || 'Purchase Amount',
          dataIndex: 'purchase_amount',
          key: 'purchase_amount',
          render: (val: number) => `¥${val?.toFixed(2) || '0.00'}`,
          sorter: (a: DetailItem, b: DetailItem) =>
            (a.purchase_amount ?? 0) - (b.purchase_amount ?? 0),
        },
      ];
    }

    // Outbound columns
    return [
      ...commonColumns,
      {
        title: t('analysis.salesAmount'),
        dataIndex: 'sales_amount',
        key: 'sales_amount',
        render: (val: number) => `¥${val?.toFixed(2) || '0.00'}`,
        sorter: (a: DetailItem, b: DetailItem) => (a.sales_amount ?? 0) - (b.sales_amount ?? 0),
      },
      {
        title: t('analysis.cost'),
        dataIndex: 'cost_amount',
        key: 'cost_amount',
        render: (val: number) => `¥${val?.toFixed(2) || '0.00'}`,
        sorter: (a: DetailItem, b: DetailItem) => (a.cost_amount ?? 0) - (b.cost_amount ?? 0),
      },
      {
        title: t('analysis.profit'),
        dataIndex: 'profit_amount',
        key: 'profit_amount',
        render: (val: number) => (
          <span style={{ color: (val || 0) >= 0 ? '#3f8600' : '#cf1322' }}>
            ¥{val?.toFixed(2) || '0.00'}
          </span>
        ),
        sorter: (a: DetailItem, b: DetailItem) => (a.profit_amount ?? 0) - (b.profit_amount ?? 0),
      },
      {
        title: t('analysis.profitRate'),
        dataIndex: 'profit_rate',
        key: 'profit_rate',
        render: (val: number) => (
          <span style={{ color: (val || 0) >= 0 ? '#3f8600' : '#cf1322' }}>
            {val?.toFixed(2) || '0.00'}%
          </span>
        ),
        sorter: (a: DetailItem, b: DetailItem) => (a.profit_rate ?? 0) - (b.profit_rate ?? 0),
      },
    ];
  };

  return (
    <Card title={t('analysis.detailData')} loading={loading} style={{ marginBottom: 24 }}>
      <Table
        dataSource={data}
        columns={getColumns()}
        rowKey="group_key"
        pagination={{ pageSize: 10 }}
        scroll={{ x: true }}
      />
    </Card>
  );
};

export default AnalysisDetailTable;
