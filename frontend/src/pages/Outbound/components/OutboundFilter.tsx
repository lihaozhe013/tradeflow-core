import { useMemo, type FC, type Dispatch, type SetStateAction } from 'react';
import { Select, DatePicker, Button, Row, Col } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import type { DefaultOptionType } from 'antd/es/select';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { OutboundFilters, Partner, Product } from '../types';

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
          placeholder={t('outbound.selectCustomer') ?? ''}
          style={{ width: '100%' }}
          value={filters.customer_short_name}
          onChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              customer_short_name: value ?? undefined,
            }))
          }
          options={partners.map((partner) => ({
            label: `${partner.short_name}(${partner.code ?? ''})`,
            value: partner.short_name,
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
              product_model: value ?? undefined,
            }))
          }
          options={products.map((product) => ({
            label: `${product.product_model}(${product.code ?? ''})`,
            value: product.product_model,
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
          placeholder={[t('outbound.startDate') ?? '', t('outbound.endDate') ?? '']}
        />
      </Col>
      <Col span={3}>
        <Button type="primary" icon={<SearchOutlined />} onClick={onFilter}>
          {t('outbound.filter')}
        </Button>
      </Col>
    </Row>
  );
};

export default OutboundFilter;
