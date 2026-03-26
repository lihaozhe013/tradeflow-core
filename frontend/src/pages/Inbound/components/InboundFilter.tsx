import { useMemo, type FC, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, DatePicker, Button, Row, Col } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import type { DefaultOptionType } from 'antd/es/select';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { InboundFilters, Partner, Product } from '../types';

interface InboundFilterProps {
  readonly filters: InboundFilters;
  readonly setFilters: Dispatch<SetStateAction<InboundFilters>>;
  readonly partners: Partner[];
  readonly products: Product[];
  readonly onFilter: () => void;
}

const InboundFilter: FC<InboundFilterProps> = ({
  filters,
  setFilters,
  partners,
  products,
  onFilter,
}) => {
  const { t } = useTranslation();
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
        : [null, null],
    }));
  };

  const filterByLabel = (input: string, option?: DefaultOptionType): boolean => {
    const label = typeof option?.label === 'string' ? option.label : undefined;
    return label ? label.toLowerCase().includes(input.toLowerCase()) : false;
  };

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={5}>
        <Select
          allowClear
          showSearch
          placeholder={t('inbound.selectSupplier')}
          style={{ width: '100%' }}
          value={filters.supplier_short_name}
          onChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              supplier_short_name: value ?? undefined,
            }))
          }
          options={partners.map((p) => ({
            label: `${p.short_name}(${p.code})`,
            value: p.short_name,
          }))}
          filterOption={filterByLabel}
        />
      </Col>
      <Col span={5}>
        <Select
          allowClear
          showSearch
          placeholder={t('inbound.selectProductModel')}
          style={{ width: '100%' }}
          value={filters.product_model}
          onChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              product_model: value ?? undefined,
            }))
          }
          options={products.map((p) => ({
            label: `${p.product_model}(${p.code})`,
            value: p.product_model,
          }))}
          filterOption={filterByLabel}
        />
      </Col>
      <Col span={8}>
        <DatePicker.RangePicker
          style={{ width: '100%' }}
          value={rangeValue}
          onChange={handleDateChange}
          format="YYYY-MM-DD"
          placeholder={[t('inbound.startDate'), t('inbound.endDate')]}
        />
      </Col>
      <Col span={3}>
        <Button type="primary" icon={<SearchOutlined />} onClick={onFilter}>
          {t('inbound.filter')}
        </Button>
      </Col>
    </Row>
  );
};

export default InboundFilter;
