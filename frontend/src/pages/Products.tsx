import ResponsiveTable from '@/components/ResponsiveTable';
import { useState, useEffect, useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { FormProps } from 'antd';
import { Button, Modal, Form, Input, Select, Space, message, Popconfirm, Card, Typography, Row, Col, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { PRODUCT_CATEGORIES } from '@/config';
import { useSimpleApi } from '@/hooks/useSimpleApi';
import { usePermissions } from '@/auth/usePermissions';

const { Title } = Typography;

type ProductItem = {
  readonly code: string;
  readonly product_model: string;
  readonly category?: string;
  readonly remark?: string;
};

type ProductListResponse = {
  readonly data: ProductItem[];
  readonly pagination?: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly pages: number;
  };
};

type PaginationInfo = {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
};

type ProductFormValues = {
  code: string;
  product_model: string;
  category?: string;
  remark?: string;
};

type ProductFilters = {
  code?: string | undefined;
  product_model?: string | undefined;
  category?: string | undefined;
};

const DEFAULT_PAGINATION: PaginationInfo = {
  current: 1,
  pageSize: 20,
  total: 0
};

const Products: FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [form] = Form.useForm<ProductFormValues>();
  const [filterForm] = Form.useForm<ProductFilters>();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<ProductFilters>({});
  const { t } = useTranslation();
  const { canWrite } = usePermissions();

  const { get, post, put, request } = useSimpleApi();

  const fetchProducts = useCallback(
    async (page = 1, nextFilters: ProductFilters = filters): Promise<void> => {
      try {
        setLoading(true);
        const query = new URLSearchParams({ page: String(page) });
        if (nextFilters.code) query.append('code', nextFilters.code);
        if (nextFilters.product_model) query.append('product_model', nextFilters.product_model);
        if (nextFilters.category) query.append('category', nextFilters.category);
        const result = await get<ProductListResponse>(`/products?${query.toString()}`);
        setProducts(Array.isArray(result?.data) ? result.data : []);
        setPagination((prev) => ({
          current: result?.pagination?.page ?? page,
          pageSize: result?.pagination?.limit ?? prev.pageSize,
          total: result?.pagination?.total ?? prev.total
        }));
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    [filters, get]
  );

  useEffect(() => {
    fetchProducts(1);
  }, [fetchProducts]);
  const productOptions = products;

  const handleAdd = (): void => {
    if (!canWrite) return;
    setEditingProduct(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: ProductItem): void => {
    if (!canWrite) return;
    setEditingProduct(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (code: string): Promise<void> => {
    if (!canWrite) return;
    try {
      await request(`/products/${code}`, { method: 'DELETE' });
      message.success(t('products.deleteSuccess'));
      fetchProducts(pagination.current, filters);
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const handleSave = async (values: ProductFormValues): Promise<void> => {
    if (!canWrite) return;
    try {
      if (editingProduct) {
        await put(`/products/${editingProduct.code}`, values);
        message.success(t('products.editSuccess'));
      } else {
        await post('/products', values);
        message.success(t('products.addSuccess'));
      }
      setModalVisible(false);
      fetchProducts(pagination.current, filters);
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const columns: ColumnsType<ProductItem> = [
    {
      title: t('products.code'),
      dataIndex: 'code',
      key: 'code',
      width: 120
    },
    {
      title: t('products.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 200
    },
    {
      title: t('products.category'),
      dataIndex: 'category',
      key: 'category',
      width: 150
    },
    {
      title: t('products.remark'),
      dataIndex: 'remark',
      key: 'remark',
      width: 300
    }
  ];

  if (canWrite) {
    columns.push({
      title: t('products.actions'),
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('products.deleteConfirm')}
            onConfirm={() => handleDelete(record.code)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      )
    });
  }

  const handleProductFieldChange: FormProps<ProductFormValues>['onValuesChange'] = (
    changedValues
  ) => {
    if (changedValues?.code) {
      const match = productOptions.find((product) => product.code === changedValues.code);
      if (match) {
        form.setFieldsValue({ product_model: match.product_model });
      }
      return;
    }

    if (changedValues?.product_model) {
      const match = productOptions.find(
        (product) => product.product_model === changedValues.product_model
      );
      if (match) {
        form.setFieldsValue({ code: match.code });
      }
    }
  };

  const handleTableChange: TableProps<ProductItem>['onChange'] = (paginationConfig) => {
    const nextPage = paginationConfig.current ?? 1;
    fetchProducts(nextPage, filters);
  };

  const handleFilter = (): void => {
    const values = filterForm.getFieldsValue();
    const nextFilters: ProductFilters = {
      code: values.code?.trim() || undefined,
      product_model: values.product_model?.trim() || undefined,
      category: values.category
    };
    setFilters(nextFilters);
    fetchProducts(1, nextFilters);
  };

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t('products.title')}
            </Title>
          </Col>
          {canWrite && (
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                {t('products.addProduct')}
              </Button>
            </Col>
          )}
        </Row>

        <Form<ProductFilters> form={filterForm} layout="inline" style={{ marginBottom: 12 }}>
          <Form.Item name="code" label={t('products.code')} style={{ minWidth: 200 }}>
            <Input allowClear placeholder={t('products.inputCode')} />
          </Form.Item>
          <Form.Item
            name="product_model"
            label={t('products.productModel')}
            style={{ minWidth: 240 }}
          >
            <Input allowClear placeholder={t('products.inputProductModel')} />
          </Form.Item>
          <Form.Item name="category" label={t('products.category')} style={{ minWidth: 220 }}>
            <Select
              showSearch
              allowClear
              placeholder={t('products.selectCategory')}
              options={PRODUCT_CATEGORIES.map((name) => ({
                value: name,
                label: name
              }))}
              filterOption={(input, option) => {
                const label = typeof option?.label === 'string' ? option.label : '';
                return label.toLowerCase().includes(input.toLowerCase());
              }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleFilter}>
              {t('common.search')}
            </Button>
          </Form.Item>
        </Form>

        <Divider />

        <ResponsiveTable<ProductItem>
            columns={columns}
            dataSource={products}
            rowKey="code"
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('products.paginationTotal', {
                  start: range[0],
                  end: range[1],
                  total
                })
            }}
            scroll={{ x: 900 }}
        />
      </Card>

      {canWrite && (
        <Modal
          title={editingProduct ? t('products.editProduct') : t('products.addProduct')}
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          footer={null}
          width={600}
        >
          <Form<ProductFormValues>
            form={form}
            layout="vertical"
            onFinish={handleSave}
            onValuesChange={handleProductFieldChange}
          >
            <Form.Item
              label={t('products.code')}
              name="code"
              rules={[
                { required: true, message: t('products.inputCode') },
                { max: 50, message: t('products.codeMax') }
              ]}
            >
              <Input placeholder={t('products.inputCode')} disabled={Boolean(editingProduct)} />
            </Form.Item>

            <Form.Item
              label={t('products.productModel')}
              name="product_model"
              rules={[
                { required: true, message: t('products.inputProductModel') },
                { max: 100, message: t('products.productModelMax') }
              ]}
            >
              <Input
                placeholder={t('products.inputProductModel')}
                disabled={Boolean(editingProduct)}
              />
            </Form.Item>

            <Form.Item
              label={t('products.category')}
              name="category"
              rules={[
                { required: true, message: t('products.selectCategory') },
                { max: 100, message: t('products.categoryMax') }
              ]}
            >
              <Select
                showSearch
                allowClear
                placeholder={t('products.selectCategory')}
                options={PRODUCT_CATEGORIES.map((name) => ({
                  value: name,
                  label: name
                }))}
                filterOption={(input, option) => {
                  const label = typeof option?.label === 'string' ? option.label : '';
                  return label.toLowerCase().includes(input.toLowerCase());
                }}
              />
            </Form.Item>

            <Form.Item
              label={t('products.remark')}
              name="remark"
              rules={[{ max: 500, message: t('products.remarkMax') }]}
            >
              <Input.TextArea placeholder={t('products.inputRemark')} rows={4} />
            </Form.Item>

            <div className="form-actions">
              <Button onClick={() => setModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {editingProduct ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
};

export default Products;
