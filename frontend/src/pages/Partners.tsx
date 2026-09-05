import { useState, useEffect, useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnsType, TableProps } from 'antd/es/table';
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
  Divider
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useSimpleApi } from '@/hooks/useSimpleApi';
import { usePermissions } from '@/auth/usePermissions';

const { Title } = Typography;
const { Option } = Select;

type PartnerItem = {
  readonly code?: string | undefined;
  readonly short_name: string;
  readonly full_name: string;
  readonly type: 0 | 1;
  readonly address?: string;
  readonly contact_person?: string;
  readonly contact_phone?: string;
};

type PartnerListResponse = {
  readonly data: PartnerItem[];
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

type PartnerFormValues = {
  code?: string | undefined;
  short_name?: string | undefined;
  full_name?: string | undefined;
  type?: 0 | 1;
  address?: string;
  contact_person?: string;
  contact_phone?: string;
};

type PartnerFilters = {
  code?: string | undefined;
  short_name?: string | undefined;
  full_name?: string | undefined;
  type?: 0 | 1 | undefined;
};

const DEFAULT_PAGINATION: PaginationInfo = {
  current: 1,
  pageSize: 20,
  total: 0
};

const Partners: FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerItem | null>(
    null
  );
  const [form] = Form.useForm<PartnerFormValues>();
  const [filterForm] = Form.useForm<PartnerFilters>();
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationInfo>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<PartnerFilters>({});
  const { t } = useTranslation();
  const { canWrite } = usePermissions();

  const { get, post, put, request } = useSimpleApi();

  const fetchPartners = useCallback(
    async (page = 1, nextFilters: PartnerFilters = filters): Promise<void> => {
      try {
        setLoading(true);
        const query = new URLSearchParams({ page: String(page) });
        if (nextFilters.code) query.append('code', nextFilters.code);
        if (nextFilters.short_name)
          query.append('short_name', nextFilters.short_name);
        if (nextFilters.full_name)
          query.append('full_name', nextFilters.full_name);
        if (nextFilters.type !== undefined)
          query.append('type', String(nextFilters.type));
        const result = await get<PartnerListResponse>(
          `/partners?${query.toString()}`
        );
        setPartners(Array.isArray(result?.data) ? result.data : []);
        setPagination((prev) => ({
          current: result?.pagination?.page ?? page,
          pageSize: result?.pagination?.limit ?? prev.pageSize,
          total: result?.pagination?.total ?? prev.total
        }));
      } catch {
        setPartners([]);
      } finally {
        setLoading(false);
      }
    },
    [filters, get]
  );

  useEffect(() => {
    fetchPartners(1);
  }, [fetchPartners]);
  const partnerOptions = partners;

  const handleAdd = (): void => {
    if (!canWrite) return;
    setEditingPartner(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: PartnerItem): void => {
    if (!canWrite) return;
    setEditingPartner(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (shortName: string): Promise<void> => {
    if (!canWrite) return;
    try {
      await request(`/partners/${shortName}`, { method: 'DELETE' });
      message.success(t('partners.deleteSuccess'));
      fetchPartners(pagination.current, filters);
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const handleSave = async (values: PartnerFormValues): Promise<void> => {
    if (!canWrite) return;
    try {
      if (
        !values.short_name ||
        !values.full_name ||
        values.type === undefined
      ) {
        message.error(
          t('common.validationError', { defaultValue: 'Validation error' })
        );
        return;
      }

      if (editingPartner) {
        await put(`/partners/${editingPartner.short_name}`, values);
        message.success(t('partners.editSuccess'));
      } else {
        await post('/partners', values);
        message.success(t('partners.addSuccess'));
      }
      setModalVisible(false);
      fetchPartners(pagination.current, filters);
    } catch {
      // 错误已经在 useSimpleApi 中处理
    }
  };

  const columns: ColumnsType<PartnerItem> = [
    {
      title: t('partners.code'),
      dataIndex: 'code',
      key: 'code',
      width: 80
    },
    {
      title: t('partners.shortName'),
      dataIndex: 'short_name',
      key: 'short_name',
      width: 100
    },
    {
      title: t('partners.fullName'),
      dataIndex: 'full_name',
      key: 'full_name',
      width: 200
    },
    {
      title: t('partners.type'),
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type) =>
        type === 0 ? t('partners.supplier') : t('partners.customer')
    },
    {
      title: t('partners.address'),
      dataIndex: 'address',
      key: 'address',
      width: 200
    },
    {
      title: t('partners.contactPerson'),
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: 100
    },
    {
      title: t('partners.contactPhone'),
      dataIndex: 'contact_phone',
      key: 'contact_phone',
      width: 120
    }
  ];

  if (canWrite) {
    columns.push({
      title: t('partners.actions'),
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
            title={t('partners.deleteConfirm')}
            onConfirm={() => handleDelete(record.short_name)}
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

  const handlePartnerFieldChange: FormProps<PartnerFormValues>['onValuesChange'] =
    (changedValues) => {
      if (changedValues?.code) {
        const match = partnerOptions.find(
          (partner) => partner.code === changedValues.code
        );
        if (match) {
          form.setFieldsValue({
            short_name: match.short_name,
            full_name: match.full_name
          });
        }
        return;
      }

      if (changedValues?.short_name) {
        const match = partnerOptions.find(
          (partner) => partner.short_name === changedValues.short_name
        );
        if (match) {
          form.setFieldsValue({ code: match.code, full_name: match.full_name });
        }
        return;
      }

      if (changedValues?.full_name) {
        const match = partnerOptions.find(
          (partner) => partner.full_name === changedValues.full_name
        );
        if (match) {
          form.setFieldsValue({
            code: match.code,
            short_name: match.short_name
          });
        }
      }
    };

  const handleTableChange: TableProps<PartnerItem>['onChange'] = (
    paginationConfig
  ) => {
    const nextPage = paginationConfig.current ?? 1;
    fetchPartners(nextPage, filters);
  };

  const handleFilter = (): void => {
    const values = filterForm.getFieldsValue();
    const nextFilters: PartnerFilters = {
      code: values.code?.trim() || undefined,
      short_name: values.short_name?.trim() || undefined,
      full_name: values.full_name?.trim() || undefined,
      type: values.type
    };
    setFilters(nextFilters);
    fetchPartners(1, nextFilters);
  };

  return (
    <div>
      <Card>
        <Row
          justify="space-between"
          align="middle"
          style={{ marginBottom: 16 }}
        >
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              {t('partners.title')}
            </Title>
          </Col>
          {canWrite && (
            <Col>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
              >
                {t('partners.addPartner')}
              </Button>
            </Col>
          )}
        </Row>

        <Form<PartnerFilters>
          form={filterForm}
          layout="inline"
          style={{ marginBottom: 12 }}
        >
          <Form.Item
            name="code"
            label={t('partners.code')}
            style={{ minWidth: 200 }}
          >
            <Input allowClear placeholder={t('partners.inputCode')} />
          </Form.Item>
          <Form.Item
            name="short_name"
            label={t('partners.shortName')}
            style={{ minWidth: 220 }}
          >
            <Input allowClear placeholder={t('partners.inputShortName')} />
          </Form.Item>
          <Form.Item
            name="full_name"
            label={t('partners.fullName')}
            style={{ minWidth: 240 }}
          >
            <Input allowClear placeholder={t('partners.inputFullName')} />
          </Form.Item>
          <Form.Item
            name="type"
            label={t('partners.type')}
            style={{ minWidth: 180 }}
          >
            <Select allowClear placeholder={t('partners.selectType')}>
              <Option value={0}>{t('partners.supplier')}</Option>
              <Option value={1}>{t('partners.customer')}</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleFilter}>
              {t('common.search')}
            </Button>
          </Form.Item>
        </Form>

        <Divider />

        <div className="responsive-table">
          <Table<PartnerItem>
            columns={columns}
            dataSource={partners}
            rowKey="short_name"
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('partners.paginationTotal', {
                  start: range[0],
                  end: range[1],
                  total
                })
            }}
            scroll={{ x: 900 }}
          />
        </div>
      </Card>

      {canWrite && (
        <Modal
          title={
            editingPartner
              ? t('partners.editPartner')
              : t('partners.addPartner')
          }
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          footer={null}
          width={600}
        >
          <Form<PartnerFormValues>
            form={form}
            layout="vertical"
            onFinish={handleSave}
            onValuesChange={handlePartnerFieldChange}
          >
            <Form.Item
              label={t('partners.code')}
              name="code"
              rules={[{ max: 50, message: t('partners.codeMax') }]}
            >
              <Input
                placeholder={t('partners.inputCode')}
                disabled={Boolean(editingPartner)}
              />
            </Form.Item>

            <Form.Item
              label={t('partners.shortName')}
              name="short_name"
              rules={[
                { required: true, message: t('partners.inputShortName') },
                { max: 50, message: t('partners.shortNameMax') }
              ]}
            >
              <Input
                placeholder={t('partners.inputShortName')}
                disabled={Boolean(editingPartner)}
              />
            </Form.Item>

            <Form.Item
              label={t('partners.fullName')}
              name="full_name"
              rules={[
                { required: true, message: t('partners.inputFullName') },
                { max: 200, message: t('partners.fullNameMax') }
              ]}
            >
              <Input placeholder={t('partners.inputFullName')} />
            </Form.Item>

            <Form.Item
              label={t('partners.type')}
              name="type"
              rules={[{ required: true, message: t('partners.selectType') }]}
            >
              <Select placeholder={t('partners.selectType')}>
                <Option value={0}>{t('partners.supplier')}</Option>
                <Option value={1}>{t('partners.customer')}</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label={t('partners.address')}
              name="address"
              rules={[{ max: 500, message: t('partners.addressMax') }]}
            >
              <Input.TextArea
                placeholder={t('partners.inputAddress')}
                rows={3}
              />
            </Form.Item>

            <Form.Item
              label={t('partners.contactPerson')}
              name="contact_person"
              rules={[{ max: 100, message: t('partners.contactPersonMax') }]}
            >
              <Input placeholder={t('partners.inputContactPerson')} />
            </Form.Item>

            <Form.Item
              label={t('partners.contactPhone')}
              name="contact_phone"
              rules={[{ max: 50, message: t('partners.contactPhoneMax') }]}
            >
              <Input placeholder={t('partners.inputContactPhone')} />
            </Form.Item>

            <div className="form-actions">
              <Button onClick={() => setModalVisible(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {editingPartner ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
};

export default Partners;
