import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FC,
  type ReactNode,
  type SetStateAction
} from 'react';
import { Button, Input, Select } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { CloseOutlined, DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import ResponsiveDateRange from '@/components/ResponsiveDateRange';
import { useTranslation } from 'react-i18next';
import type { OutboundFilters, Partner, Product } from '../types';

const NUMBER_FILTER_DEBOUNCE_MS = 300;
const ADVANCED_PANEL_ID = 'outbound-advanced-filters';

type NumberFilterField = 'keyword' | 'order_number' | 'invoice_number' | 'receipt_number';
type AdvancedNumberField = Exclude<NumberFilterField, 'keyword'>;

interface OutboundFilterProps {
  readonly filters: OutboundFilters;
  readonly setFilters: Dispatch<SetStateAction<OutboundFilters>>;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly onFilter: () => void;
}

interface ActiveFilterChip {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly onClear: () => void;
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

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null): void => {
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
    setAdvancedOpen((open) => !open);
  };

  const clearAdvancedFilter = (field: AdvancedNumberField): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (field === 'order_number') setOrderInput('');
    if (field === 'invoice_number') setInvoiceInput('');
    if (field === 'receipt_number') setReceiptInput('');
    commitNumberFilter(field, '');
  };

  const resetFilters = (): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOrderInput('');
    setInvoiceInput('');
    setReceiptInput('');
    setFilters((prev) => ({
      ...prev,
      keyword: undefined,
      customer_short_name: undefined,
      product_model: undefined,
      order_number: undefined,
      invoice_number: undefined,
      receipt_number: undefined,
      dateRange: [null, null]
    }));
  };

  const activeFilters = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    const [start, end] = filters.dateRange;

    if (start || end) {
      chips.push({
        key: 'dateRange',
        label: t('common.dateRange'),
        value: `${start ?? '...'} - ${end ?? '...'}`,
        onClear: () => setFilters((prev) => ({ ...prev, dateRange: [null, null] }))
      });
    }
    if (filters.order_number) {
      chips.push({
        key: 'order_number',
        label: t('outbound.orderNumber'),
        value: filters.order_number,
        onClear: () => clearAdvancedFilter('order_number')
      });
    }
    if (filters.invoice_number) {
      chips.push({
        key: 'invoice_number',
        label: t('outbound.invoiceNumber'),
        value: filters.invoice_number,
        onClear: () => clearAdvancedFilter('invoice_number')
      });
    }
    if (filters.receipt_number) {
      chips.push({
        key: 'receipt_number',
        label: t('outbound.receiptNumber'),
        value: filters.receipt_number,
        onClear: () => clearAdvancedFilter('receipt_number')
      });
    }

    return chips;
  }, [filters, t]);

  const advancedField = (
    label: string,
    placeholder: string,
    inputId: string,
    value: string,
    field: AdvancedNumberField,
    setInput: Dispatch<SetStateAction<string>>
  ): ReactNode => (
    <div className="page-field">
      <label className="page-field-label" htmlFor={inputId}>
        {label}
      </label>
      <Input
        id={inputId}
        allowClear
        placeholder={placeholder}
        value={value}
        onChange={(event) => handleNumberChange(field, event.target.value, setInput)}
        onPressEnter={() => handleNumberPressEnter(field, value)}
      />
    </div>
  );

  return (
    <div className="page-toolbar">
      <div className="page-toolbar-row">
        <Input
          className="page-toolbar-search"
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('outbound.searchNumberPlaceholder')}
          value={keywordInput}
          onChange={(event) => handleNumberChange('keyword', event.target.value, setKeywordInput)}
          onPressEnter={() => handleNumberPressEnter('keyword', keywordInput)}
        />
        <Select
          className="page-toolbar-field"
          allowClear
          showSearch
          placeholder={t('outbound.selectCustomer') ?? ''}
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
        <Select
          className="page-toolbar-field"
          allowClear
          showSearch
          placeholder={t('outbound.selectProductModel') ?? ''}
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
        <div className="page-toolbar-actions">
          <Button type="primary" icon={<SearchOutlined />} onClick={onFilter}>
            {t('outbound.filter')}
          </Button>
          <Button type="text" onClick={resetFilters}>
            {t('common.reset')}
          </Button>
          <Button
            type="text"
            className="page-toolbar-toggle"
            icon={advancedOpen ? <UpOutlined /> : <DownOutlined />}
            aria-expanded={advancedOpen}
            aria-controls={ADVANCED_PANEL_ID}
            onClick={toggleAdvanced}
          >
            {advancedOpen ? t('common.collapse') : t('common.advancedFilters')}
          </Button>
        </div>
      </div>

      {!advancedOpen && activeFilters.length > 0 ? (
        <div className="page-active-filters">
          <span className="page-active-label">{t('common.activeFilters')}</span>
          {activeFilters.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="page-filter-chip"
              title={`${chip.label}: ${chip.value}`}
              onClick={chip.onClear}
            >
              <span className="page-filter-chip-label">{chip.label}</span>
              <span className="page-filter-chip-value">{chip.value}</span>
              <CloseOutlined className="page-filter-chip-remove" aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="page-link-button" onClick={resetFilters}>
            {t('common.clearAll')}
          </button>
        </div>
      ) : null}

      {advancedOpen ? (
        <div className="page-advanced" id={ADVANCED_PANEL_ID}>
          <div className="page-advanced-head">{t('common.moreFilters')}</div>
          <div className="page-advanced-grid">
            <div className="page-field" role="group" aria-label={t('common.dateRange')}>
              <span className="page-field-label">{t('common.dateRange')}</span>
              <ResponsiveDateRange
                value={rangeValue}
                onChange={handleDateChange}
                format="YYYY-MM-DD"
                startPlaceholder={t('outbound.startDate') ?? ''}
                endPlaceholder={t('outbound.endDate') ?? ''}
              />
            </div>
            {advancedField(
              t('outbound.orderNumber'),
              t('outbound.inputOrderNumber'),
              'outbound-filter-order-number',
              orderInput,
              'order_number',
              setOrderInput
            )}
            {advancedField(
              t('outbound.invoiceNumber'),
              t('outbound.inputInvoiceNumber'),
              'outbound-filter-invoice-number',
              invoiceInput,
              'invoice_number',
              setInvoiceInput
            )}
            {advancedField(
              t('outbound.receiptNumber'),
              t('outbound.inputReceiptNumber'),
              'outbound-filter-receipt-number',
              receiptInput,
              'receipt_number',
              setReceiptInput
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OutboundFilter;
