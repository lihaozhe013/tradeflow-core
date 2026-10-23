import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  Menu,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import type { FormInstance } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/page/PageHeader';
import api, { RequestError } from '@/utils/request';
import { useRefreshRuntimeSettings } from '@/config/runtime';
import './settings.css';

const sections = [
  'general',
  'payment-methods',
  'product-categories',
  'about',
  'export-templates'
] as const;
type Section = (typeof sections)[number];
interface SettingRecord {
  section: Section;
  value: Record<string, unknown>;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}
interface PaymentItem {
  key: string;
  code: string;
  label: string;
}
interface Template {
  sheetName: string;
  columns: { key: string; label: string; visible?: boolean }[];
  labels?: Record<string, string>;
}
type Catalog = Record<string, { columns: string[]; labels: string[] }>;
const templateGroups = {
  masterData: ['partners', 'products', 'prices', 'inventory'],
  transactions: ['inbound', 'outbound', 'inbound_statement', 'outbound_statement', 'invoice'],
  finance: [
    'receivable_summary',
    'receivable_details',
    'receivable_payments',
    'payable_summary',
    'payable_details',
    'payable_payments'
  ],
  analysis: [
    'analysis_summary',
    'analysis_detail',
    'analysis_customer_summary',
    'analysis_customer_detail',
    'analysis_product_summary',
    'analysis_product_detail',
    'analysis_detail_by_product',
    'analysis_detail_by_customer'
  ]
};
const clone = <T,>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function SectionForm({
  record,
  draft,
  catalog,
  onChange,
  onSaved,
  onReload
}: {
  record: SettingRecord;
  draft: Record<string, unknown>;
  catalog: Catalog;
  onChange: (value: Record<string, unknown>) => void;
  onSaved: (row: SettingRecord) => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const current = Form.useWatch([], { form, preserve: true }) ?? draft;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('partners');
  const refreshRuntime = useRefreshRuntimeSettings();
  const section = record.section;
  const dirty = !equal(draft, record.value);
  const required = [{ required: true, whitespace: true, message: t('settings.required') }];
  const reset = () => {
    form.resetFields();
    form.setFieldsValue(clone(record.value));
    onChange(clone(record.value));
    setError('');
    setConflict(false);
  };
  const save = async () => {
    setError('');
    setConflict(false);
    try {
      await form.validateFields();
      setSaving(true);
      const response = await api.put<{ data: SettingRecord }>(`/settings/${section}`, {
        value: form.getFieldsValue(true),
        version: record.version
      });
      onSaved(response.data);
      if (['general', 'payment-methods', 'product-categories'].includes(section))
        await refreshRuntime();
      message.success(t('settings.saved'));
    } catch (failure) {
      if (failure instanceof RequestError) {
        setConflict(failure.status === 409);
        setError(t(failure.status === 409 ? 'settings.conflict' : 'settings.invalid'));
        const issues = (failure.data as { issues?: { path: (string | number)[] }[] })?.issues ?? [];
        const fields = issues
          .filter((issue) => issue.path.length)
          .map((issue) => ({ name: issue.path, errors: [t('settings.invalidField')] }));
        form.setFields(fields);
        if (
          section === 'export-templates' &&
          fields[0] &&
          typeof fields[0].name[0] === 'string' &&
          catalog[fields[0].name[0]]
        )
          setSelectedTemplate(fields[0].name[0] as string);
        if (fields[0])
          requestAnimationFrame(() => form.scrollToField(fields[0].name, { focus: true }));
      } else if (failure && typeof failure === 'object' && 'errorFields' in failure) {
        const fields = (failure as { errorFields: { name: string[] }[] }).errorFields;
        setError(t('settings.invalid'));
        if (fields[0]) form.scrollToField(fields[0].name, { focus: true });
      } else setError(t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };
  const controls = (
    index: number,
    count: number,
    move: (a: number, b: number) => void,
    remove: (index: number) => void
  ) => (
    <Space size={4}>
      <Button
        aria-label={t('settings.moveUp')}
        icon={<ArrowUpOutlined aria-hidden="true" />}
        disabled={saving || index === 0}
        onClick={() => move(index, index - 1)}
      />
      <Button
        aria-label={t('settings.moveDown')}
        icon={<ArrowDownOutlined aria-hidden="true" />}
        disabled={saving || index === count - 1}
        onClick={() => move(index, index + 1)}
      />
      <Button
        danger
        aria-label={t('settings.remove')}
        icon={<DeleteOutlined aria-hidden="true" />}
        disabled={saving || count === 1}
        onClick={() => remove(index)}
      />
    </Space>
  );
  const itemValidator = (_: unknown, items: unknown[]) => {
    const values = (items ?? []).map((item) =>
      typeof item === 'string' ? item.trim() : String((item as PaymentItem)?.label ?? '').trim()
    );
    return values.length && new Set(values).size === values.length
      ? Promise.resolve()
      : Promise.reject(new Error(t('settings.uniqueList')));
  };
  const template = current[selectedTemplate] as Template | undefined;
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={draft}
      disabled={saving}
      onValuesChange={() => onChange(form.getFieldsValue(true))}
      onFinish={() => void save()}
    >
      <div className="settings-section-heading">
        <div>
          <Typography.Title level={3}>{t(`settings.sections.${section}`)}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {t(`settings.descriptions.${section}`)}
          </Typography.Paragraph>
        </div>
        <Tag
          icon={dirty ? undefined : <CheckOutlined aria-hidden="true" />}
          color={dirty ? 'gold' : 'default'}
        >
          {t(dirty ? 'settings.unsaved' : 'settings.upToDate')}
        </Tag>
      </div>
      {error && (
        <Alert
          className="settings-error"
          type="error"
          showIcon
          role="alert"
          title={error}
          action={
            conflict ? (
              <Button
                onClick={() =>
                  Modal.confirm({ title: t('settings.reloadConfirm'), onOk: onReload })
                }
              >
                {t('settings.reload')}
              </Button>
            ) : undefined
          }
        />
      )}
      {section === 'general' && (
        <>
          <div className="settings-field-grid">
            <Form.Item
              name="currency_unit_symbol"
              label={t('settings.currencySymbol')}
              rules={[...required, { max: 10 }]}
            >
              <Input maxLength={10} />
            </Form.Item>
            <div className="settings-currency-preview">
              <Typography.Text type="secondary">{t('settings.preview')}</Typography.Text>
              <Typography.Title level={2}>
                {String(current.currency_unit_symbol ?? '')}1,234.56
              </Typography.Title>
            </div>
          </div>
          <Alert type="info" showIcon title={t('settings.currencyNotice')} />
        </>
      )}
      {section === 'payment-methods' && (
        <>
          <Form.Item
            name="defaultCode"
            label={t('settings.defaultItem')}
            rules={[{ required: true, message: t('settings.required') }]}
          >
            <Select
              options={((current.items ?? []) as PaymentItem[]).map((item) => ({
                value: item.code,
                label: item.label
              }))}
            />
          </Form.Item>
          <Form.List name="items" rules={[{ validator: itemValidator }]}>
            {(fields, { add, remove, move }, { errors }) => (
              <>
                <div className="settings-list">
                  {fields.map(({ key, name }, index) => (
                    <Card size="small" key={key} className="settings-list-card">
                      <div className="settings-list-row">
                        <Form.Item
                          name={[name, 'label']}
                          label={`${t('settings.label')} ${index + 1}`}
                          rules={[...required, { max: 100 }]}
                        >
                          <Input maxLength={100} />
                        </Form.Item>
                        {controls(index, fields.length, move, remove)}
                      </div>
                      <Collapse
                        ghost
                        size="small"
                        items={[
                          {
                            key: 'technical',
                            label: t('settings.technical'),
                            children: (
                              <div className="settings-field-grid">
                                <Form.Item
                                  name={[name, 'key']}
                                  label={t('settings.key')}
                                  rules={[
                                    ...required,
                                    { pattern: /^[a-z][a-z0-9_]*$/, message: t('settings.keyHint') }
                                  ]}
                                >
                                  <Input maxLength={64} />
                                </Form.Item>
                                <Form.Item
                                  name={[name, 'code']}
                                  label={t('settings.code')}
                                  rules={[
                                    ...required,
                                    {
                                      pattern: /^[A-Z][A-Z0-9_]*$/,
                                      message: t('settings.codeHint')
                                    }
                                  ]}
                                >
                                  <Input maxLength={64} />
                                </Form.Item>
                              </div>
                            )
                          }
                        ]}
                      />
                    </Card>
                  ))}
                </div>
                <Form.ErrorList errors={errors} />
                <Button
                  type="dashed"
                  icon={<PlusOutlined aria-hidden="true" />}
                  onClick={() => {
                    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
                    add({ key: `method_${id}`, code: `METHOD_${id.toUpperCase()}`, label: '' });
                  }}
                >
                  {t('settings.addPayment')}
                </Button>
              </>
            )}
          </Form.List>
          <Alert
            className="settings-history-notice"
            type="info"
            showIcon
            title={t('settings.historyNotice')}
          />
        </>
      )}
      {section === 'product-categories' && (
        <>
          <Form.Item name="default" label={t('settings.defaultItem')} rules={required}>
            <Select
              options={((current.list ?? []) as string[]).map((value) => ({ label: value, value }))}
            />
          </Form.Item>
          <Form.List name="list" rules={[{ validator: itemValidator }]}>
            {(fields, { add, remove, move }, { errors }) => (
              <>
                <div className="settings-list">
                  {fields.map(({ key, name }, index) => (
                    <div className="settings-category-row" key={key}>
                      <Form.Item
                        name={name}
                        label={`${t('settings.category')} ${index + 1}`}
                        rules={[...required, { max: 100 }]}
                      >
                        <Input maxLength={100} />
                      </Form.Item>
                      {controls(index, fields.length, move, remove)}
                    </div>
                  ))}
                </div>
                <Form.ErrorList errors={errors} />
                <Button
                  type="dashed"
                  icon={<PlusOutlined aria-hidden="true" />}
                  onClick={() => add('')}
                >
                  {t('settings.addCategory')}
                </Button>
              </>
            )}
          </Form.List>
          <Alert
            className="settings-history-notice"
            type="info"
            showIcon
            title={t('settings.historyNotice')}
          />
        </>
      )}
      {section === 'about' && <AboutFields form={form} />}
      {section === 'export-templates' && (
        <>
          <Form.Item label={t('settings.template')}>
            <Select
              value={selectedTemplate}
              onChange={setSelectedTemplate}
              options={Object.entries(templateGroups).map(([group, keys]) => ({
                label: t(`settings.groups.${group}`),
                options: keys.map((key) => ({ value: key, label: t(`settings.templates.${key}`) }))
              }))}
            />
          </Form.Item>
          <Form.Item
            name={[selectedTemplate, 'sheetName']}
            label={t('settings.sheetName')}
            rules={[...required, { max: 31 }]}
          >
            <Input maxLength={31} />
          </Form.Item>
          <Form.List name={[selectedTemplate, 'columns']} key={selectedTemplate}>
            {(fields, { add, remove, move }) => (
              <>
                <div className="settings-list">
                  {fields.map(({ key, name }, index) => (
                    <div className="settings-export-row" key={key}>
                      <Form.Item
                        name={[name, 'visible']}
                        valuePropName="checked"
                        getValueProps={(value) => ({ checked: value !== false })}
                      >
                        <Checkbox
                          aria-label={`${t('settings.showColumn')}: ${template?.columns[index]?.label ?? ''}`}
                        />
                      </Form.Item>
                      <div className="settings-column-label">
                        <Typography.Text code>{template?.columns[index]?.key}</Typography.Text>
                        <Form.Item
                          name={[name, 'label']}
                          label={t('settings.columnLabel')}
                          rules={required}
                        >
                          <Input maxLength={200} />
                        </Form.Item>
                        <Form.Item name={[name, 'key']} hidden>
                          <Input />
                        </Form.Item>
                      </div>
                      {controls(index, fields.length, move, remove)}
                    </div>
                  ))}
                </div>
                <Select
                  className="settings-add-column"
                  value={null}
                  placeholder={t('settings.addColumn')}
                  aria-label={t('settings.addColumn')}
                  options={(catalog[selectedTemplate]?.columns ?? [])
                    .filter((key) => !template?.columns.some((col) => col.key === key))
                    .map((key) => ({ label: key, value: key }))}
                  onChange={(key) => add({ key, label: key, visible: true })}
                />
              </>
            )}
          </Form.List>
          {Object.keys(template?.labels ?? {}).length > 0 && (
            <Collapse
              className="settings-template-labels"
              items={[
                {
                  key: 'labels',
                  label: t('settings.additionalLabels'),
                  forceRender: true,
                  children: (
                    <div className="settings-field-grid">
                      {Object.keys(template.labels).map((key) => (
                        <Form.Item
                          key={key}
                          name={[selectedTemplate, 'labels', key]}
                          label={t(`settings.exportLabels.${key}`)}
                          rules={required}
                        >
                          <Input maxLength={1000} />
                        </Form.Item>
                      ))}
                    </div>
                  )
                }
              ]}
            />
          )}
          <Typography.Title level={5}>{t('settings.preview')}</Typography.Title>
          <div className="settings-sheet-preview">
            <Table
              size="small"
              pagination={false}
              dataSource={[{ key: 'example' }]}
              columns={(template?.columns ?? [])
                .filter((column) => column.visible !== false)
                .map((column) => ({ key: column.key, title: column.label, render: () => '—' }))}
              scroll={{ x: 'max-content' }}
            />
            <Typography.Text type="secondary">{t('settings.exampleOnly')}</Typography.Text>
          </div>
        </>
      )}
      <div className="settings-save-bar">
        <Typography.Text type="secondary">
          {t('settings.lastModified', {
            user: record.updatedBy ?? t('settings.system'),
            date: new Date(record.updatedAt).toLocaleString()
          })}
        </Typography.Text>
        <Space>
          <Button onClick={reset} disabled={!dirty || saving}>
            {t('settings.cancel')}
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined aria-hidden="true" />}
            loading={saving}
            disabled={!dirty}
          >
            {t('settings.save')}
          </Button>
        </Space>
      </div>
    </Form>
  );
}

function AboutFields({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const value = Form.useWatch([], { form, preserve: true }) ?? form.getFieldsValue(true);
  const groups = {
    company: ['name', 'slogan', 'description'],
    system: ['version', 'releaseDate', 'techStack', 'team'],
    contact: ['email', 'phone', 'address']
  };
  return (
    <>
      <Form.Item
        name="title"
        label={t('settings.aboutFields.title')}
        rules={[{ required: true, whitespace: true, message: t('settings.required') }]}
      >
        <Input maxLength={200} />
      </Form.Item>
      {Object.entries(groups).map(([group, keys]) => (
        <div key={group}>
          <Typography.Title level={5}>{t(`settings.aboutGroups.${group}`)}</Typography.Title>
          <div className="settings-field-grid">
            {keys.map((key) => (
              <Form.Item
                key={key}
                name={[group, key]}
                label={t(`settings.aboutFields.${key}`)}
                rules={
                  ['version', 'releaseDate', 'techStack'].includes(key)
                    ? [{ required: true, whitespace: true, message: t('settings.required') }]
                    : key === 'email'
                      ? [{ type: 'email', message: t('settings.invalidField') }]
                      : []
                }
              >
                {key === 'description' ? (
                  <Input.TextArea rows={4} maxLength={10000} />
                ) : (
                  <Input
                    type={key === 'releaseDate' ? 'date' : 'text'}
                    maxLength={key === 'address' ? 1000 : 500}
                  />
                )}
              </Form.Item>
            ))}
          </div>
        </div>
      ))}
      <Typography.Title level={5}>{t('settings.preview')}</Typography.Title>
      <Card className="settings-about-preview">
        <Typography.Title level={3}>{value.title}</Typography.Title>
        <Typography.Title level={4}>{value.company?.name}</Typography.Title>
        <Typography.Paragraph>{value.company?.slogan}</Typography.Paragraph>
        <Typography.Paragraph className="settings-description-preview">
          {value.company?.description}
        </Typography.Paragraph>
        <Descriptions
          column={{ xs: 1, sm: 2 }}
          items={Object.entries(groups).flatMap(([group, keys]) =>
            keys
              .filter((key) => !['name', 'slogan', 'description'].includes(key))
              .map((key) => ({
                key: `${group}.${key}`,
                label: t(`settings.aboutFields.${key}`),
                children: value[group]?.[key] || '—'
              }))
          )}
        />
      </Card>
    </>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<Partial<Record<Section, SettingRecord>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<Section, Record<string, unknown>>>>({});
  const [catalog, setCatalog] = useState<Catalog>({});
  const [active, setActive] = useState<Section>('general');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const load = async (only?: Section) => {
    setFailed(false);
    try {
      const response = await api.get<{ data: SettingRecord[]; catalog: Catalog }>('/settings');
      if (
        !Array.isArray(response.data) ||
        sections.some(
          (section) =>
            !response.data.some(
              (row) =>
                row.section === section &&
                typeof row.version === 'number' &&
                row.value &&
                typeof row.value === 'object'
            )
        )
      )
        throw new Error('Invalid settings response.');
      if (!alive.current) return;
      const rows = response.data.filter((row) => !only || row.section === only);
      setRecords((prev) => ({
        ...prev,
        ...Object.fromEntries(rows.map((row) => [row.section, row]))
      }));
      setDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(rows.map((row) => [row.section, clone(row.value)]))
      }));
      setCatalog(response.catalog);
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  const dirty = sections.some(
    (section) => records[section] && !equal(records[section].value, drafts[section])
  );
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const row = records[active];
  return (
    <div className="page settings-page tone-slate">
      <PageHeader
        eyebrow={t('nav.administration')}
        title={t('settings.title')}
        description={t('settings.subtitle')}
        icon={<SettingOutlined />}
        status={<Tag>{t('settings.superuserOnly')}</Tag>}
      />
      {failed && (
        <Alert
          type="error"
          showIcon
          title={t('settings.loadFailed')}
          action={
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              onClick={() => void load(row ? active : undefined)}
            >
              {t('settings.retry')}
            </Button>
          }
        />
      )}
      {loading ? (
        <div className="settings-loading">
          <Spin size="large" />
        </div>
      ) : !row ? (
        <Empty description={t('settings.loadFailed')} />
      ) : (
        <div className="settings-layout">
          <Card className="settings-navigation" styles={{ body: { padding: 8 } }}>
            <Menu
              selectedKeys={[active]}
              onClick={({ key }) => setActive(key as Section)}
              items={sections.map((section) => ({
                key: section,
                label: (
                  <span>
                    {t(`settings.sections.${section}`)}
                    {records[section] && !equal(records[section].value, drafts[section]) && (
                      <span className="settings-dirty-dot" aria-label={t('settings.unsaved')} />
                    )}
                  </span>
                )
              }))}
            />
          </Card>
          <Card className="settings-editor">
            <SectionForm
              key={`${active}-${row.version}-${row.updatedAt}`}
              record={row}
              draft={drafts[active]}
              catalog={catalog}
              onChange={(value) => setDrafts((prev) => ({ ...prev, [active]: value }))}
              onSaved={(saved) => {
                setRecords((prev) => ({ ...prev, [saved.section]: saved }));
                setDrafts((prev) => ({ ...prev, [saved.section]: clone(saved.value) }));
              }}
              onReload={() => void load(active)}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
