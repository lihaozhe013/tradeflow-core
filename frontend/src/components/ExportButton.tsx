import { useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Typography,
  message
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSimpleApi } from '@/hooks/useSimpleApi';

interface Column {
  key: string;
  label: string;
  visible: boolean;
  width: number;
}
interface Preview {
  id: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
  total: number;
}
interface Context {
  direction?: 'inbound' | 'outbound';
  source?: 'partners' | 'products' | 'prices' | 'receivable' | 'payable' | 'inventory';
  filters: Record<string, unknown>;
  ids: (string | number)[];
}

export default function ExportButton({
  context,
  disabled
}: {
  context: Context;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const api = useSimpleApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [scope, setScope] = useState('all');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [font, setFont] = useState('Arial');
  const [fontSize, setFontSize] = useState(11);
  const frozen = useRef(context);
  const generation = useRef(0);
  const label = (key: string) => t(`exportPreview.${key}`);
  const prepare = async (range: string) => {
    const version = ++generation.current;
    setBusy(true);
    setPreview(null);
    try {
      const response = await api.post<Preview>(
        frozen.current.source ? '/export/previews/records' : '/export/previews/transactions',
        {
          ...(frozen.current.source ? { source: frozen.current.source } : {}),
          direction: frozen.current.direction,
          filters: frozen.current.filters,
          ...(range === 'selected'
            ? frozen.current.source
              ? { keys: frozen.current.ids }
              : { ids: frozen.current.ids }
            : {})
        }
      );
      if (version !== generation.current) return;
      setPreview(response);
      const names: Record<string, string> = {
        partner_name:
          frozen.current.direction === 'inbound' ? 'supplierShortName' : 'customerShortName',
        product_model: 'productModel',
        unit_price: 'unitPrice',
        total_price: 'totalPrice',
        order_number: 'orderNumber',
        receipt_number: 'receiptNumber',
        invoice_number: 'invoiceNumber',
        inbound_date: 'inboundDate',
        outbound_date: 'outboundDate',
        supplier_code: 'supplierCode',
        customer_code: 'customerCode'
      };
      setColumns(
        response.columns.map((c) => ({
          ...c,
          label: t(
            frozen.current.source
              ? `exportPreview.fields.${c.key}`
              : `${frozen.current.direction}.${names[c.key] ?? c.key}`,
            {
              defaultValue: c.label
            }
          )
        }))
      );
    } catch (error) {
      if (version === generation.current)
        message.error(error instanceof Error ? error.message : label('failed'));
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  const show = () => {
    frozen.current = structuredClone(context);
    const range = context.ids.length ? 'selected' : 'all';
    setScope(range);
    setOpen(true);
    void prepare(range);
  };
  const patch = (index: number, change: Partial<Column>) =>
    setColumns((items) => items.map((c, i) => (i === index ? { ...c, ...change } : c)));
  const move = (index: number, delta: number) =>
    setColumns((items) => {
      const copy = [...items];
      [copy[index], copy[index + delta]] = [copy[index + delta]!, copy[index]!];
      return copy;
    });
  const download = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const blob = await api.postBlob(`/export/previews/${preview.id}/download`, {
        format,
        columns,
        font,
        fontSize
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${frozen.current.source ?? frozen.current.direction}_${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      message.error(error instanceof Error ? error.message : label('failed'));
    } finally {
      setBusy(false);
    }
  };
  const visible = columns.filter((c) => c.visible);
  return (
    <>
      <Button icon={<ExportOutlined aria-hidden="true" />} disabled={disabled} onClick={show}>
        {label('export')}
      </Button>
      <Modal
        open={open}
        title={label('title')}
        width="min(1280px, 96vw)"
        onCancel={() => {
          ++generation.current;
          setOpen(false);
        }}
        footer={
          <Space>
            <Button
              onClick={() => {
                ++generation.current;
                setOpen(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!preview?.total || !visible.length || columns.some((c) => !c.label.trim())}
              onClick={() => void download()}
            >
              {label('export')}
            </Button>
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Radio.Group
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              void prepare(e.target.value);
            }}
            disabled={busy}
          >
            <Radio value="selected" disabled={!frozen.current.ids.length}>
              {label('selected')} ({frozen.current.ids.length})
            </Radio>
            <Radio value="all">{label('all')}</Radio>
          </Radio.Group>
          <Select
            aria-label={label('format')}
            value={format}
            onChange={setFormat}
            options={[
              { value: 'xlsx', label: 'Excel' },
              { value: 'csv', label: 'CSV' }
            ]}
          />
          <Typography.Text>
            {label('count')}: {preview?.total ?? '—'}
          </Typography.Text>
        </Space>
        <Typography.Paragraph type="secondary">
          {Object.entries(frozen.current.filters)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(' · ')}
        </Typography.Paragraph>
        <Spin spinning={busy}>
          <Tabs
            items={[
              {
                key: 'preview',
                label: label('preview'),
                children: (
                  <>
                    <Table
                      size="small"
                      rowKey={(row) => String(row.id ?? row.code ?? row.product_model)}
                      dataSource={preview?.rows ?? []}
                      pagination={false}
                      scroll={{ x: 'max-content', y: 400 }}
                      columns={visible.map((c) => ({
                        key: c.key,
                        title: c.label,
                        dataIndex: c.key,
                        width: c.width * 8,
                        render: (value) => (
                          <span
                            style={
                              format === 'xlsx'
                                ? { fontFamily: font, fontSize: `${fontSize}pt` }
                                : undefined
                            }
                          >
                            {String(value ?? '')}
                          </span>
                        )
                      }))}
                    />
                    <Typography.Text type="secondary">{label('sample')}</Typography.Text>
                  </>
                )
              },
              {
                key: 'columns',
                label: label('columns'),
                children: (
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    {columns.map((c, i) => (
                      <Space key={c.key} wrap>
                        <Checkbox
                          aria-label={c.label}
                          checked={c.visible}
                          onChange={(e) => patch(i, { visible: e.target.checked })}
                        />
                        <Input
                          aria-label={label('heading')}
                          value={c.label}
                          onChange={(e) => patch(i, { label: e.target.value })}
                        />
                        <InputNumber
                          aria-label={label('width')}
                          min={5}
                          max={100}
                          value={c.width}
                          onChange={(v) => patch(i, { width: v ?? 18 })}
                        />
                        <Button
                          aria-label={label('up')}
                          icon={<ArrowUpOutlined aria-hidden="true" />}
                          disabled={!i}
                          onClick={() => move(i, -1)}
                        />
                        <Button
                          aria-label={label('down')}
                          icon={<ArrowDownOutlined aria-hidden="true" />}
                          disabled={i === columns.length - 1}
                          onClick={() => move(i, 1)}
                        />
                      </Space>
                    ))}
                  </Space>
                )
              },
              ...(format === 'xlsx'
                ? [
                    {
                      key: 'style',
                      label: label('style'),
                      children: (
                        <Space wrap>
                          <Select
                            aria-label={label('font')}
                            style={{ width: 200 }}
                            value={font}
                            onChange={setFont}
                            options={['Arial', 'Calibri', 'Microsoft YaHei', 'SimSun'].map(
                              (value) => ({ value, label: value })
                            )}
                          />
                          <InputNumber
                            aria-label={label('fontSize')}
                            min={8}
                            max={36}
                            value={fontSize}
                            onChange={(v) => setFontSize(v ?? 11)}
                          />
                        </Space>
                      )
                    }
                  ]
                : [])
            ]}
          />
        </Spin>
      </Modal>
    </>
  );
}
