import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import type { FormProps } from 'antd';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  message,
  Popconfirm,
  Card,
  Typography,
  Row,
  Col,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { PRODUCT_CATEGORIES } from '@/config';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';

const { Title } = Typography;

type ProductItem = {
  readonly code: string;
  readonly product_model: string;
  readonly category?: string;
  readonly remark?: string;
};

type ProductListResponse = {
  readonly data: ProductItem[];
};

type ProductFormValues = {
  code: string;
  product_model: string;
  category?: string;
  remark?: string;
};

const Products: FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [form] = Form.useForm<ProductFormValues>();
  const { t } = useTranslation();

  const { post, put, request } = useSimpleApi();

  const {
    data: productsResponse,
    loading,
    refetch: refreshProducts,
  } = useSimpleApiData<ProductListResponse>('/products', { data: [] });

  const products = productsResponse?.data ?? [];
  const productOptions = products;

  const handleAdd = (): void => {
    setEditingProduct(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: ProductItem): void => {
    setEditingProduct(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (code: string): Promise<void> => {
    try {
      await request(`/products/${code}`, { method: 'DELETE' });
      message.success(t('products.deleteSuccess'));
      refreshProducts();
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const handleSave = async (values: ProductFormValues): Promise<void> => {
    try {
      if (editingProduct) {
        await put(`/products/${editingProduct.code}`, values);
        message.success(t('products.editSuccess'));
      } else {
        await post('/products', values);
        message.success(t('products.addSuccess'));
      }
      setModalVisible(false);
      refreshProducts();
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const columns: ColumnsType<ProductItem> = [
    {
      title: t('products.code'),
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: t('products.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 200,
    },
    {
      title: t('products.category'),
      dataIndex: 'category',
      key: 'category',
      width: 150,
    },
    {
      title: t('products.remark'),
      dataIndex: 'remark',
      key: 'remark',
      width: 300,
    },
    {
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
      ),
    },
  ];

  const handleProductFieldChange: FormProps<ProductFormValues>['onValuesChange'] = (
    changedValues,
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
        (product) => product.product_model === changedValues.product_model,
      );
      if (match) {
        form.setFieldsValue({ code: match.code });
      }
    }
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
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {t('products.addProduct')}
            </Button>
          </Col>
        </Row>

        <Divider />

        <div className="responsive-table">
          <Table<ProductItem>
            columns={columns}
            dataSource={products}
            rowKey="code"
            loading={loading}
            pagination={{
              pageSize: 10,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('products.paginationTotal', {
                  start: range[0],
                  end: range[1],
                  total,
                }),
            }}
            scroll={{ x: 900 }}
          />
        </div>
      </Card>

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
              { max: 50, message: t('products.codeMax') },
            ]}
          >
            <Input placeholder={t('products.inputCode')} disabled={Boolean(editingProduct)} />
          </Form.Item>

          <Form.Item
            label={t('products.productModel')}
            name="product_model"
            rules={[
              { required: true, message: t('products.inputProductModel') },
              { max: 100, message: t('products.productModelMax') },
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
              { max: 100, message: t('products.categoryMax') },
            ]}
          >
            <Select
              showSearch
              allowClear
              placeholder={t('products.selectCategory')}
              options={PRODUCT_CATEGORIES.map((name) => ({ value: name, label: name }))}
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
    </div>
  );
};

export default Products;
