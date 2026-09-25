import { DatePicker, Grid, Space } from 'antd';
import type { Dayjs } from 'dayjs';
import type { ReactElement } from 'react';

interface ResponsiveDateRangeProps {
  readonly value: [Dayjs | null, Dayjs | null] | null;
  readonly onChange: (value: [Dayjs | null, Dayjs | null] | null) => void;
  readonly startPlaceholder: string;
  readonly endPlaceholder: string;
  readonly format?: string;
}

function ResponsiveDateRange({
  value,
  onChange,
  startPlaceholder,
  endPlaceholder,
  format = 'YYYY-MM-DD'
}: ResponsiveDateRangeProps): ReactElement {
  const screens = Grid.useBreakpoint();
  const [start, end] = value ?? [null, null];

  if (screens.md) {
    return (
      <DatePicker.RangePicker
        value={value}
        onChange={(dates) =>
          onChange(dates ? [dates[0] ?? null, dates[1] ?? null] : null)
        }
        format={format}
        placeholder={[startPlaceholder, endPlaceholder]}
        style={{ width: '100%' }}
      />
    );
  }

  return (
    <Space direction="vertical" size={8} className="responsive-date-range">
      <DatePicker
        value={start}
        onChange={(date) => onChange([date, end])}
        format={format}
        placeholder={startPlaceholder}
        style={{ width: '100%' }}
      />
      <DatePicker
        value={end}
        onChange={(date) => onChange([start, date])}
        format={format}
        placeholder={endPlaceholder}
        style={{ width: '100%' }}
      />
    </Space>
  );
}

export default ResponsiveDateRange;
