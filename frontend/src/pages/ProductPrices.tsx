import { useState, useCallback, useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { FormProps } from 'antd';
import type { AutoCompleteProps } from 'antd/es/auto-complete';
import type { SelectProps } from 'antd/es/select';
import type { Dayjs } from 'dayjs';
import { currency_unit_symbol } from '@/config/types';
import {
  Table,
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  InputNumber,
  Space,
  message,
  Popconfirm,
  Card,
  Typography,
  Row,
  Col,
  Divider,
  AutoComplete,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSimpleApi, useSimpleApiData } from '@/hooks/useSimpleApi';

const { Title } = Typography;

type PaginationInfo = {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
};

type ApiListResponse<T> = {
  readonly data: T[];
  readonly pagination?: PaginationInfo;
};

type ProductPriceItem = {
  readonly id: number;
  readonly partner_short_name: string;
  readonly partner_code?: string;
  readonly product_model: string;
  readonly product_code?: string;
  readonly unit_price: number;
  readonly effective_date: string;
};

type PartnerItem = {
  readonly code: string;
  readonly short_name: string;
  readonly full_name: string;
};

type ProductItem = {
  readonly code: string;
  readonly product_model: string;
  readonly category?: string;
};

type FilterState = {
  partner_short_name?: string | undefined;
  product_model?: string | undefined;
  effective_date?: string | undefined;
};

type ProductPriceFormValues = {
  partner_code?: string | undefined;
  partner_short_name?: string | undefined;
  product_code?: string | undefined;
  product_model?: string | undefined;
  unit_price: number;
  effective_date: Dayjs | null;
};

type ProductPriceFilters = {
  partner_short_name?: string | undefined;
  product_model?: string | undefined;
  effective_date?: Dayjs | null | undefined;
};

const DEFAULT_PAGINATION: PaginationInfo = {
  current: 1,
  pageSize: 10,
  total: 0,
};

const ProductPrices: FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrice, setEditingPrice] = useState<ProductPriceItem | null>(null);
  const [form] = Form.useForm<ProductPriceFormValues>();
  const [filterForm] = Form.useForm<ProductPriceFilters>();
  const { t } = useTranslation();

  const [filters, setFilters] = useState<FilterState>({});
  const [pagination, setPagination] = useState<PaginationInfo>(DEFAULT_PAGINATION);
  const { current } = pagination;

  const { post, put, request } = useSimpleApi();

  const buildProductPricesUrl = useCallback(() => {
    const params = new URLSearchParams({
      page: current.toString(),
    });

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.append(key, value);
      }
    });

    return `/product-prices?${params.toString()}`;
  }, [filters, current]);

  const {
    data: productPricesResponse,
    loading,
    refetch: refreshProductPrices,
  } = useSimpleApiData<ApiListResponse<ProductPriceItem>>(buildProductPricesUrl(), {
    data: [],
    pagination: DEFAULT_PAGINATION,
  });

  const { data: partnersResponse } = useSimpleApiData<ApiListResponse<PartnerItem>>('/partners', {
    data: [],
  });

  const { data: productsResponse } = useSimpleApiData<ApiListResponse<ProductItem>>('/products', {
    data: [],
  });

  const productPrices = productPricesResponse?.data ?? [];
  const partners = partnersResponse?.data ?? [];
  const products = productsResponse?.data ?? [];

  /* useEffect removed to avoid setState in effect loop
  useEffect(() => {
    if (!productPricesResponse?.pagination) {
      return;
    }

    setPagination(prev => ({
      current: productPricesResponse.pagination?.current ?? prev.current,
      pageSize: productPricesResponse.pagination?.pageSize ?? prev.pageSize,
      total: productPricesResponse.pagination?.total ?? prev.total,
    }));
  }, [productPricesResponse]);
  */

  const handleAdd = (): void => {
    setEditingPrice(null);
    form.resetFields();
    form.setFieldsValue({
      effective_date: dayjs(),
    });
    setModalVisible(true);
  };

  const handleEdit = (record: ProductPriceItem): void => {
    setEditingPrice(record);
    form.setFieldsValue({
      ...record,
      effective_date: record.effective_date ? dayjs(record.effective_date) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await request(`/product-prices/${id}`, { method: 'DELETE' });
      message.success(t('productPrices.deleteSuccess'));
      refreshProductPrices();
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const handleSave = async (values: ProductPriceFormValues): Promise<void> => {
    try {
      if (!values.partner_short_name || !values.product_model) {
        message.error(t('common.validationError', { defaultValue: 'Validation error' }));
        return;
      }

      const formattedValues = {
        ...values,
        effective_date: values.effective_date ? values.effective_date.format('YYYY-MM-DD') : null,
      };

      if (editingPrice) {
        await put(`/product-prices/${editingPrice.id}`, formattedValues);
        message.success(t('productPrices.editSuccess'));
      } else {
        await post('/product-prices', formattedValues);
        message.success(t('productPrices.addSuccess'));
      }
      setModalVisible(false);
      refreshProductPrices();
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const columns: ColumnsType<ProductPriceItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: t('productPrices.partnerShortName'),
      dataIndex: 'partner_short_name',
      key: 'partner_short_name',
      width: 120,
    },
    {
      title: t('productPrices.productModel'),
      dataIndex: 'product_model',
      key: 'product_model',
      width: 150,
    },
    {
      title: t('productPrices.unitPrice'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      render: (price) => `${currency_unit_symbol}${price}`,
    },
    {
      title: t('productPrices.effectiveDate'),
      dataIndex: 'effective_date',
      key: 'effective_date',
      width: 120,
    },
    {
      title: t('productPrices.actions'),
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
            title={t('productPrices.deleteConfirm')}
            onConfirm={() => handleDelete(record.id)}
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

  const partnerCodeOptions: AutoCompleteProps['options'] = partners.map((partner) => ({
    value: partner.code,
    label: `${partner.code} - ${partner.short_name}`,
  }));

  const partnerShortNameOptions: SelectProps['options'] = partners.map((partner) => ({
    value: partner.short_name,
    label: `${partner.short_name} - ${partner.full_name}`,
  }));

  const productCodeOptions: AutoCompleteProps['options'] = products.map((product) => ({
    value: product.code,
    label: `${product.code} - ${product.product_model}`,
  }));

  const productModelOptions: SelectProps['options'] = products.map((product) => ({
    value: product.product_model,
    label: `${product.product_model} - ${product.category ?? ''}`,
  }));

  const handlePartnerCodeChange = (code: string): void => {
    const partner = partners.find((item) => item.code === code);
    if (partner) {
      form.setFieldsValue({
        partner_code: partner.code,
        partner_short_name: partner.short_name,
      });
    } else {
      form.setFieldsValue({ partner_short_name: undefined });
    }
  };

  const handlePartnerShortNameChange = (shortName: string): void => {
    const partner = partners.find((item) => item.short_name === shortName);
    if (partner) {
      form.setFieldsValue({
        partner_code: partner.code,
        partner_short_name: partner.short_name,
      });
    } else {
      form.setFieldsValue({ partner_code: undefined });
    }
  };

  const handleProductCodeChange = (code: string): void => {
    const product = products.find((item) => item.code === code);
    if (product) {
      form.setFieldsValue({
        product_code: product.code,
        product_model: product.product_model,
      });
    } else {
      form.setFieldsValue({ product_model: undefined });
    }
  };

  const handleProductModelChange = (model: string): void => {
    const product = products.find((item) => item.product_model === model);
    if (product) {
      form.setFieldsValue({
        product_code: product.code,
        product_model: product.product_model,
      });
    } else {
      form.setFieldsValue({ product_code: undefined });
    }
  };

  const handleFilter = (): void => {
    const values = filterForm.getFieldsValue();
    setFilters({
      partner_short_name: values.partner_short_name,
      product_model: values.product_model,
      effective_date: values.effective_date
        ? values.effective_date.format('YYYY-MM-DD')
        : undefined,
    });
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleTableChange: TableProps<ProductPriceItem>['onChange'] = (paginationConfig) => {
    setPagination((prev) => ({
      ...prev,
      current: paginationConfig.current ?? prev.current,
    }));
  };

  const handleFormValuesChange: FormProps<ProductPriceFormValues>['onValuesChange'] = (
    changedValues,
  ) => {
    if (changedValues?.partner_code) {
      handlePartnerCodeChange(changedValues.partner_code);
    } else if (changedValues?.partner_short_name) {
      handlePartnerShortNameChange(changedValues.partner_short_name);
    } else if (changedValues?.product_code) {
      handleProductCodeChange(changedValues.product_code);
    } else if (changedValues?.product_model) {
      handleProductModelChange(changedValues.product_model);
    }
  };

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t('productPrices.title')}
            </Title>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {t('productPrices.addPrice')}
            </Button>
          </Col>
        </Row>

        <Form<ProductPriceFilters> form={filterForm} layout="inline" style={{ marginBottom: 12 }}>
          <Form.Item
            name="partner_short_name"
            label={t('productPrices.partnerShortName')}
            style={{ minWidth: 260 }}
          >
            <Select
              allowClear
              showSearch
              placeholder={t('productPrices.selectPartner')}
              options={partnerShortNameOptions}
              filterOption={(input, option) => {
                const label = typeof option?.label === 'string' ? option.label : '';
                return label.toLowerCase().includes(input.toLowerCase());
              }}
            />
          </Form.Item>
          <Form.Item
            name="product_model"
            label={t('productPrices.productModel')}
            style={{ minWidth: 260 }}
          >
            <Select
              allowClear
              showSearch
              placeholder={t('productPrices.selectProductModel')}
              options={productModelOptions}
              filterOption={(input, option) => {
                const label = typeof option?.label === 'string' ? option.label : '';
                return label.toLowerCase().includes(input.toLowerCase());
              }}
            />
          </Form.Item>
          <Form.Item name="effective_date" label={t('productPrices.effectiveDate')}>
            <DatePicker allowClear format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleFilter}>
              {t('common.search') ?? 'Search'}
            </Button>
          </Form.Item>
        </Form>

        <Divider />

        <div className="responsive-table">
          <Table<ProductPriceItem>
            columns={columns}
            dataSource={productPrices}
            rowKey="id"
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: productPricesResponse?.pagination?.total ?? 0,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('productPrices.paginationTotal', {
                  start: range[0],
                  end: range[1],
                  total,
                }),
            }}
            scroll={{ x: 800 }}
          />
        </div>
      </Card>

      <Modal
        title={editingPrice ? t('productPrices.editPrice') : t('productPrices.addPrice')}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form<ProductPriceFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSave}
          onValuesChange={handleFormValuesChange}
        >
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item label={t('productPrices.partnerCode')} name="partner_code">
                <AutoComplete
                  options={partnerCodeOptions}
                  placeholder={t('productPrices.inputPartnerCode')}
                  onChange={handlePartnerCodeChange}
                  filterOption={(inputValue, option) => {
                    const optionValue = option?.value;
                    const normalized =
                      typeof optionValue === 'number'
                        ? optionValue.toString()
                        : (optionValue ?? '');
                    return normalized.toLowerCase().includes(inputValue.toLowerCase());
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t('productPrices.partnerShortName')}
                name="partner_short_name"
                rules={[{ required: true, message: t('productPrices.selectPartner') }]}
              >
                <Select
                  placeholder={t('productPrices.selectPartner')}
                  showSearch
                  options={partnerShortNameOptions}
                  onChange={handlePartnerShortNameChange}
                  filterOption={(input, option) => {
                    const value = typeof option?.value === 'string' ? option.value : '';
                    return value.toLowerCase().includes(input.toLowerCase());
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item label={t('productPrices.productCode')} name="product_code">
                <AutoComplete
                  options={productCodeOptions}
                  placeholder={t('productPrices.inputProductCode')}
                  onChange={handleProductCodeChange}
                  filterOption={(inputValue, option) => {
                    const optionValue = option?.value;
                    const normalized =
                      typeof optionValue === 'number'
                        ? optionValue.toString()
                        : (optionValue ?? '');
                    return normalized.toLowerCase().includes(inputValue.toLowerCase());
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t('productPrices.productModel')}
                name="product_model"
                rules={[{ required: true, message: t('productPrices.selectProductModel') }]}
              >
                <Select
                  placeholder={t('productPrices.selectProductModel')}
                  showSearch
                  options={productModelOptions}
                  onChange={handleProductModelChange}
                  filterOption={(input, option) => {
                    const value = typeof option?.value === 'string' ? option.value : '';
                    return value.toLowerCase().includes(input.toLowerCase());
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={t('productPrices.unitPrice')}
            name="unit_price"
            rules={[
              { required: true, message: t('productPrices.inputUnitPrice') },
              { type: 'number', min: 0, message: t('productPrices.unitPriceMin') },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder={t('productPrices.inputUnitPrice')}
              precision={4}
              min={0}
              addonBefore={currency_unit_symbol}
            />
          </Form.Item>

          <Form.Item
            label={t('productPrices.effectiveDate')}
            name="effective_date"
            rules={[{ required: true, message: t('productPrices.selectEffectiveDate') }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder={t('productPrices.selectEffectiveDate')}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <div className="form-actions">
            <Button onClick={() => setModalVisible(false)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit">
              {editingPrice ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductPrices;
