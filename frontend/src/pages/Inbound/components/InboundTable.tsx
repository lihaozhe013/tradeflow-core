import { Table, Button, Space, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import type { TableProps } from 'antd/es/table';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { FC, Key, Dispatch, SetStateAction } from 'react';
import type { InboundRecord, Partner, Product } from '../types';
import { currency_unit_symbol } from "@/config/types";
interface InboundTableProps {
  readonly inboundRecords: InboundRecord[];
  readonly loading: boolean;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly selectedRowKeys: Key[];
  readonly setSelectedRowKeys: Dispatch<SetStateAction<Key[]>>;
  readonly onEdit: (record: InboundRecord) => void;
  readonly onDelete: (id: number) => void;
  readonly onTableChange: NonNullable<TableProps<InboundRecord>['onChange']>;
  readonly pagination: TablePaginationConfig;
}

const InboundTable: FC<InboundTableProps> = ({
  inboundRecords,
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
  const columns: ColumnsType<InboundRecord> = [
    {
      title: t('inbound.id'),
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: t('inbound.supplierShortName'),
      dataIndex: ['partner', 'short_name'],
      key: 'partner.short_name',
      width: 100,
      filters: partners.map(p => ({ text: p.short_name, value: p.short_name })),
      onFilter: (value, record) => record.partner?.short_name === value,
      render: (_, record) => record.partner?.short_name,
    },
    {
      title: t('inbound.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 180,
      filters: products.map(p => ({ text: p.product_model, value: p.product_model })),
      onFilter: (value, record) => record.product_model === value,
    },
    {
      title: t('inbound.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
    },
    {
      title: t('inbound.unitPrice'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      render: price => `${currency_unit_symbol}${price}`,
      sorter: true,
    },
    {
      title: t('inbound.totalPrice'),
      dataIndex: 'total_price',
      key: 'total_price',
      width: 100,
      render: price => `${currency_unit_symbol}${price}`,
      sorter: true,
    },
    {
      title: t('inbound.inboundDate'),
      dataIndex: 'inbound_date',
      key: 'inbound_date',
      width: 100,
      sorter: true,
    },
    {
      title: t('inbound.orderNumber'),
      dataIndex: 'order_number',
      key: 'order_number',
      width: 160,
    },
    {
      title: t('inbound.receiptNumber'),
      dataIndex: 'receipt_number',
      key: 'receipt_number',
      width: 140,
    },
    {
      title: t('inbound.invoiceNumber'),
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      width: 140,
    },
    {
      title: t('inbound.actions'),
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
            title={t('inbound.deleteConfirm')}
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

  const rowSelection: TableRowSelection<InboundRecord> = {
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
        dataSource={inboundRecords}
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

export default InboundTable;
