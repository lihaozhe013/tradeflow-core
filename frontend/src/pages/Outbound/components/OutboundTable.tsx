import { Table, Button, Space, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import type { TableProps } from 'antd/es/table';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { FC, Key, Dispatch, SetStateAction } from 'react';
import type { OutboundRecord, Partner, Product } from '../types';
import { currency_unit_symbol } from "@/config/types";
interface OutboundTableProps {
  readonly outboundRecords: OutboundRecord[];
  readonly loading: boolean;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly selectedRowKeys: Key[];
  readonly setSelectedRowKeys: Dispatch<SetStateAction<Key[]>>;
  readonly onEdit: (record: OutboundRecord) => void;
  readonly onDelete: (id: number) => void;
  readonly onTableChange: NonNullable<TableProps<OutboundRecord>['onChange']>;
  readonly pagination: TablePaginationConfig;
}

const OutboundTable: FC<OutboundTableProps> = ({
  outboundRecords,
  loading,
  partners,
  products,
  selectedRowKeys,
  setSelectedRowKeys,
  onEdit,
  onDelete,
  onTableChange,
  pagination,
}) => {
  const { t } = useTranslation();
  const columns: ColumnsType<OutboundRecord> = [
    {
      title: t('outbound.id'),
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: t('outbound.customerShortName'),
      dataIndex: ['partner', 'short_name'],
      key: 'partner.short_name',
      width: 100,
      filters: partners.map(p => ({ text: p.short_name, value: p.short_name })),
      onFilter: (value, record) => record.partner?.short_name === value,
      render: (_, record) => record.partner?.short_name,
    },
    {
      title: t('outbound.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 180,
      filters: products.map(product => ({ text: product.product_model, value: product.product_model })),
      onFilter: (value, record) => record.product_model === value,
    },
    {
      title: t('outbound.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
    },
    {
      title: t('outbound.unitPrice'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      render: price => `${currency_unit_symbol}${price}`,
      sorter: true,
    },
    {
      title: t('outbound.totalPrice'),
      dataIndex: 'total_price',
      key: 'total_price',
      width: 100,
      render: price => `${currency_unit_symbol}${price}`,
      sorter: true,
    },
    {
      title: t('outbound.outboundDate'),
      dataIndex: 'outbound_date',
      key: 'outbound_date',
      width: 100,
      sorter: true,
    },
    {
      title: t('outbound.orderNumber'),
      dataIndex: 'order_number',
      key: 'order_number',
      width: 160,
    },
    {
      title: t('outbound.receiptNumber'),
      dataIndex: 'receipt_number',
      key: 'receipt_number',
      width: 140,
    },
    {
      title: t('outbound.invoiceNumber'),
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      width: 140,
    },
    {
      title: t('outbound.actions'),
      key: 'actions',
      width: 80,
      render: (_value, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
            size="small"
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('outbound.deleteConfirm')}
            onConfirm={() => onDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection: TableRowSelection<OutboundRecord> = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    onChange: (keys: Key[]) => {
      setSelectedRowKeys(keys);
    },
  };

  return (
    <div className="responsive-table">
      <Table
        columns={columns}
        dataSource={outboundRecords}
        rowKey="id"
        loading={loading}
        rowSelection={rowSelection}
        onChange={onTableChange}
        pagination={pagination}
        scroll={{ x: 1320 }}
      />
    </div>
  );
};

export default OutboundTable;
