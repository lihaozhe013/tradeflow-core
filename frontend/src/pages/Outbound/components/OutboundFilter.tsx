import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FC,
  type SetStateAction
} from 'react';
import { Select, DatePicker, Button, Row, Col, Input } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import type { DefaultOptionType } from 'antd/es/select';
import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { OutboundFilters, Partner, Product } from '../types';

const NUMBER_FILTER_DEBOUNCE_MS = 300;

type NumberFilterField = 'keyword' | 'order_number' | 'invoice_number' | 'receipt_number';

interface OutboundFilterProps {
  readonly filters: OutboundFilters;
  readonly setFilters: Dispatch<SetStateAction<OutboundFilters>>;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly onFilter: () => void;
}

const OutboundFilter: FC<OutboundFilterProps> = ({
  filters,
  setFilters,
  partners,
  products,
  onFilter
}) => {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState(filters.keyword ?? '');
  const [orderInput, setOrderInput] = useState(filters.order_number ?? '');
  const [invoiceInput, setInvoiceInput] = useState(filters.invoice_number ?? '');
  const [receiptInput, setReceiptInput] = useState(filters.receipt_number ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const rangeValue = useMemo<[Dayjs | null, Dayjs | null] | null>(() => {
    const [start, end] = filters.dateRange;
    if (!start && !end) {
      return null;
    }
    return [start ? dayjs(start) : null, end ? dayjs(end) : null];
  }, [filters.dateRange]);

  const handleDateChange: RangePickerProps['onChange'] = (dates) => {
    setFilters((prev) => ({
      ...prev,
      dateRange: dates
        ? [dates[0]?.format('YYYY-MM-DD') ?? null, dates[1]?.format('YYYY-MM-DD') ?? null]
        : [null, null]
    }));
  };

  const filterByLabel = (input: string, option?: DefaultOptionType): boolean => {
    const label = typeof option?.label === 'string' ? option.label : undefined;
    return label ? label.toLowerCase().includes(input.toLowerCase()) : false;
  };

  const commitNumberFilter = (field: NumberFilterField, raw: string): void => {
    const value = raw.trim();
    setFilters((prev) => {
      if (field === 'keyword') return { ...prev, keyword: value || undefined };
      if (field === 'order_number') return { ...prev, order_number: value || undefined };
      if (field === 'invoice_number') return { ...prev, invoice_number: value || undefined };
      return { ...prev, receipt_number: value || undefined };
    });
  };

  const handleNumberChange = (
    field: NumberFilterField,
    raw: string,
    setInput: Dispatch<SetStateAction<string>>
  ): void => {
    setInput(raw);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!raw.trim()) {
      commitNumberFilter(field, raw);
      return;
    }
    debounceRef.current = setTimeout(
      () => commitNumberFilter(field, raw),
      NUMBER_FILTER_DEBOUNCE_MS
    );
  };

  const handleNumberPressEnter = (field: NumberFilterField, raw: string): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    commitNumberFilter(field, raw);
  };

  const toggleAdvanced = (): void => {
    if (advancedOpen) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setOrderInput('');
      setInvoiceInput('');
      setReceiptInput('');
      setFilters((prev) => ({
        ...prev,
        order_number: undefined,
        invoice_number: undefined,
        receipt_number: undefined,
        dateRange: [null, null]
      }));
    }
    setAdvancedOpen((open) => !open);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={8}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('outbound.searchNumberPlaceholder')}
            value={keywordInput}
            onChange={(event) => handleNumberChange('keyword', event.target.value, setKeywordInput)}
            onPressEnter={() => handleNumberPressEnter('keyword', keywordInput)}
          />
        </Col>
        <Col span={5}>
          <Select
            allowClear
            showSearch
            placeholder={t('outbound.selectCustomer') ?? ''}
            style={{ width: '100%' }}
            value={filters.customer_short_name}
            onChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                customer_short_name: value ?? undefined
              }))
            }
            options={partners.map((partner) => ({
              label: `${partner.short_name}(${partner.code ?? ''})`,
              value: partner.short_name
            }))}
            filterOption={filterByLabel}
          />
        </Col>
        <Col span={5}>
          <Select
            allowClear
            showSearch
            placeholder={t('outbound.selectProductModel') ?? ''}
            style={{ width: '100%' }}
            value={filters.product_model}
            onChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                product_model: value ?? undefined
              }))
            }
            options={products.map((product) => ({
              label: `${product.product_model}(${product.code ?? ''})`,
              value: product.product_model
            }))}
            filterOption={filterByLabel}
          />
        </Col>
        <Col span={2}>
          <Button type="primary" icon={<SearchOutlined />} onClick={onFilter}>
            {t('outbound.filter')}
          </Button>
        </Col>
        <Col span={4} style={{ textAlign: 'right' }}>
          <Button
            type="link"
            icon={advancedOpen ? <UpOutlined /> : <DownOutlined />}
            onClick={toggleAdvanced}
          >
            {advancedOpen ? t('common.collapse') : t('common.advancedFilters')}
          </Button>
        </Col>
      </Row>
      {advancedOpen && (
        <>
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={6}>
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                value={rangeValue}
                onChange={handleDateChange}
                format="YYYY-MM-DD"
                placeholder={[t('outbound.startDate') ?? '', t('outbound.endDate') ?? '']}
              />
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={6}>
              <Input
                allowClear
                placeholder={t('outbound.inputOrderNumber')}
                value={orderInput}
                onChange={(event) =>
                  handleNumberChange('order_number', event.target.value, setOrderInput)
                }
                onPressEnter={() => handleNumberPressEnter('order_number', orderInput)}
              />
            </Col>
            <Col span={6}>
              <Input
                allowClear
                placeholder={t('outbound.inputInvoiceNumber')}
                value={invoiceInput}
                onChange={(event) =>
                  handleNumberChange('invoice_number', event.target.value, setInvoiceInput)
                }
                onPressEnter={() => handleNumberPressEnter('invoice_number', invoiceInput)}
              />
            </Col>
            <Col span={6}>
              <Input
                allowClear
                placeholder={t('outbound.inputReceiptNumber')}
                value={receiptInput}
                onChange={(event) =>
                  handleNumberChange('receipt_number', event.target.value, setReceiptInput)
                }
                onPressEnter={() => handleNumberPressEnter('receipt_number', receiptInput)}
              />
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default OutboundFilter;
