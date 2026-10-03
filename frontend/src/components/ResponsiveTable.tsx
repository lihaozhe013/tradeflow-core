import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react';
import { Button, Card, Checkbox, Empty, Grid, Pagination, Select, Spin, Table } from 'antd';
import type { TableProps } from 'antd/es/table';
import type { ColumnType, Key, SorterResult } from 'antd/es/table/interface';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

type ResponsiveTableProps<RecordType extends object> = TableProps<RecordType> & {
  readonly mobileTitleKey?: string;
  readonly mobileSubtitleKey?: string | null;
  readonly mobileSummaryKeys?: readonly string[];
  readonly mobileCardVariant?: 'default' | 'summary';
};

function readPath(value: unknown, path: Key | readonly Key[] | undefined): unknown {
  const parts = Array.isArray(path) ? path : typeof path === 'string' ? path.split('.') : [];
  return parts.reduce<unknown>((current, part) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[String(part)];
  }, value);
}

function getRecordKey<RecordType extends object>(
  record: RecordType,
  index: number,
  rowKey: TableProps<RecordType>['rowKey']
): Key {
  if (typeof rowKey === 'function') return rowKey(record, index);
  if (typeof rowKey === 'string') {
    const value = readPath(record, rowKey);
    if (typeof value === 'string' || typeof value === 'number') return value;
  }
  const recordKey = (record as { key?: unknown }).key;
  return typeof recordKey === 'string' || typeof recordKey === 'number' ? recordKey : index;
}

function getColumnKey<RecordType extends object>(
  column: ColumnType<RecordType>
): string | undefined {
  if (column.key !== undefined) return String(column.key);
  const dataIndex = column.dataIndex;
  return typeof dataIndex === 'string' || typeof dataIndex === 'number'
    ? String(dataIndex)
    : Array.isArray(dataIndex)
      ? dataIndex.map(String).join('.')
      : undefined;
}

function isActionColumn<RecordType extends object>(
  column: ColumnType<RecordType>
): boolean {
  const key = getColumnKey(column)?.toLowerCase();
  const title = typeof column.title === 'string' ? column.title.toLowerCase() : '';
  return (
    key === 'action' ||
    key === 'actions' ||
    key === 'operation' ||
    key === 'operations' ||
    (!column.dataIndex && /actions?|operations?|操作|작업/.test(title))
  );
}

function flattenColumns<RecordType extends object>(
  columns: NonNullable<TableProps<RecordType>['columns']>
): ColumnType<RecordType>[] {
  return columns.flatMap((column) => {
    if ('children' in column && Array.isArray(column.children)) {
      return flattenColumns(column.children);
    }
    return [column as ColumnType<RecordType>];
  });
}

function getColumnTitle<RecordType extends object>(column: ColumnType<RecordType>): ReactNode {
  return typeof column.title === 'function' ? getColumnKey(column) ?? 'Details' : column.title;
}

function getCompareFunction<RecordType extends object>(
  sorter: ColumnType<RecordType>['sorter']
): ((left: RecordType, right: RecordType) => number) | undefined {
  if (typeof sorter === 'function') return sorter;
  if (sorter && typeof sorter === 'object' && typeof sorter.compare === 'function') {
    return sorter.compare;
  }
  return undefined;
}

function ResponsiveTable<RecordType extends object>({
  columns = [],
  dataSource = [],
  rowKey,
  rowSelection,
  pagination = {},
  loading,
  onChange,
  mobileTitleKey,
  mobileSubtitleKey,
  mobileSummaryKeys,
  mobileCardVariant = 'default',
  ...tableProps
}: ResponsiveTableProps<RecordType>): ReactElement {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [isCompactTable, setIsCompactTable] = useState(() =>
    window.matchMedia('(max-width: 1599px)').matches
  );
  const [mobileSorter, setMobileSorter] = useState<SorterResult<RecordType>>({});
  const mobileColumns = flattenColumns(columns);
  const sortableColumns = mobileColumns.filter((column) => Boolean(column.sorter));
  const activeSorter = mobileColumns.find((column) => column.sortOrder);
  const selectedKeys = rowSelection?.selectedRowKeys ?? rowSelection?.defaultSelectedRowKeys ?? [];
  const pageSize = pagination === false ? dataSource.length : (pagination.pageSize ?? 10);
  const currentPage = pagination === false ? 1 : (pagination.current ?? 1);
  const total = pagination === false ? dataSource.length : (pagination.total ?? dataSource.length);
  const sorterColumnKey = activeSorter ? getColumnKey(activeSorter) : String(mobileSorter.columnKey ?? '');
  const sorterOrder = activeSorter?.sortOrder ?? mobileSorter.order;
  const sorterSelectValue =
    sorterColumnKey && sorterOrder ? `${sorterColumnKey}:${sorterOrder}` : undefined;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1599px)');
    const updateViewport = (): void => setIsCompactTable(mediaQuery.matches);
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  const visibleData = useMemo(() => {
    const selectedColumn = sortableColumns.find((column) => getColumnKey(column) === sorterColumnKey);
    const compare = selectedColumn ? getCompareFunction(selectedColumn.sorter) : undefined;
    if (!selectedColumn || !compare || !sorterOrder) {
      return dataSource;
    }
    return [...dataSource].sort((left, right) => {
      const value = compare(left, right);
      return sorterOrder === 'descend' ? -value : value;
    });
  }, [dataSource, sortableColumns, sorterColumnKey, sorterOrder]);

  const handlePageChange = (page: number): void => {
    if (pagination === false) return;
    onChange?.(
      { ...pagination, current: page, pageSize },
      {},
      mobileSorter,
      { currentDataSource: [...dataSource], action: 'paginate' }
    );
  };

  const handleSortChange = (value: string | undefined): void => {
    const [key, order] = value?.split(':') ?? [];
    const column = sortableColumns.find((item) => getColumnKey(item) === key);
    const nextSorter: SorterResult<RecordType> = column && order
      ? {
          column,
          columnKey: column.key,
          field: column.dataIndex as Key | readonly Key[] | undefined,
          order: order as SorterResult<RecordType>['order']
        }
      : {};
    setMobileSorter(nextSorter);
    if (pagination === false) return;
    onChange?.(
      { ...pagination, current: 1, pageSize },
      {},
      nextSorter,
      { currentDataSource: [...dataSource], action: 'sort' }
    );
  };

  const toggleSelected = (record: RecordType, index: number, checked: boolean): void => {
    if (!rowSelection?.onChange) return;
    const key = getRecordKey(record, index, rowKey);
    const nextKeys = checked
      ? [...selectedKeys, key]
      : selectedKeys.filter((selectedKey) => selectedKey !== key);
    const selectedRows = dataSource.filter((item, itemIndex) =>
      nextKeys.includes(getRecordKey(item, itemIndex, rowKey))
    );
    rowSelection.onChange(nextKeys, selectedRows, { type: 'single' });
  };

  const renderCell = (
    column: ColumnType<RecordType>,
    record: RecordType,
    index: number
  ): ReactNode => {
    const value = readPath(record, column.dataIndex as Key | readonly Key[] | undefined);
    if (!column.render) return (value as ReactNode) ?? '—';
    const rendered = column.render(value, record, index);
    if (
      isValidElement<{ children?: ReactNode }>(rendered) &&
      Array.isArray(rendered.props.children)
    ) {
      return cloneElement(rendered, {}, Children.toArray(rendered.props.children));
    }
    return rendered as ReactNode;
  };

  const renderField = (
    column: ColumnType<RecordType>,
    record: RecordType,
    index: number
  ): ReactElement => (
    <div className="responsive-record-field" key={getColumnKey(column)}>
      <span className="responsive-record-label">{getColumnTitle(column)}</span>
      <span className="responsive-record-value">{renderCell(column, record, index)}</span>
    </div>
  );

  const compactColumnLimit = screens.xl ? 7 : 4;
  const compactVisibleColumns = mobileColumns.filter((column) =>
    isActionColumn(column) ||
    mobileColumns
      .filter((candidate) => !isActionColumn(candidate))
      .slice(0, compactColumnLimit)
      .includes(column)
  );
  const compactVisibleKeys = new Set(compactVisibleColumns.map(getColumnKey));
  const compactHiddenColumns = mobileColumns.filter(
    (column) => !compactVisibleKeys.has(getColumnKey(column))
  );

  if (!isMobile) {
    return (
      <div className="responsive-table">
        <Table<RecordType>
          {...tableProps}
          columns={isCompactTable ? compactVisibleColumns : columns}
          dataSource={dataSource}
          rowKey={rowKey}
          rowSelection={rowSelection}
          pagination={pagination}
          loading={loading}
          onChange={onChange}
          scroll={
            isCompactTable
              ? tableProps.scroll?.y
                ? { y: tableProps.scroll.y }
                : undefined
              : tableProps.scroll
          }
          expandable={
            isCompactTable && compactHiddenColumns.length > 0
              ? {
                  ...tableProps.expandable,
                  expandedRowRender:
                    tableProps.expandable?.expandedRowRender ??
                    ((record, index) => (
                      <div className="responsive-table-details">
                        {compactHiddenColumns.map((column) => renderField(column, record, index))}
                      </div>
                    ))
                }
              : tableProps.expandable
          }
        />
      </div>
    );
  }

  const titleColumn =
    (mobileTitleKey
      ? mobileColumns.find((column) => getColumnKey(column) === mobileTitleKey)
      : undefined) ??
    mobileColumns.find((column) => column.dataIndex && !isActionColumn(column));
  const subtitleColumn =
    mobileSubtitleKey === null
      ? undefined
      : mobileSubtitleKey
        ? mobileColumns.find((column) => getColumnKey(column) === mobileSubtitleKey)
        : mobileColumns.find((column) => column !== titleColumn && column.dataIndex && !isActionColumn(column));
  const summaryCandidates = mobileColumns.filter(
    (column) => column !== titleColumn && column !== subtitleColumn && !isActionColumn(column)
  );
  const primaryColumns = mobileSummaryKeys
    ? mobileSummaryKeys
        .map((key) => summaryCandidates.find((column) => getColumnKey(column) === key))
        .filter((column): column is ColumnType<RecordType> => Boolean(column))
    : summaryCandidates.slice(0, 3);
  const primarySet = new Set([titleColumn, subtitleColumn, ...primaryColumns]);
  const detailColumns = mobileColumns.filter((column) => !isActionColumn(column) && !primarySet.has(column));
  const actionColumns = mobileColumns.filter(isActionColumn);
  const isLoading = typeof loading === 'boolean' ? loading : Boolean(loading?.spinning);

  return (
    <div className="responsive-record-list">
      {sortableColumns.length > 0 && (
        <div className="responsive-record-toolbar">
          <Select
            allowClear
            placeholder={t('common.sortRecords')}
            aria-label={t('common.sortRecords')}
            value={sorterSelectValue}
            onChange={handleSortChange}
            options={sortableColumns.flatMap((column) => {
              const key = getColumnKey(column);
              if (!key) return [];
              return [
                { value: `${key}:ascend`, label: `${String(getColumnTitle(column))} ↑` },
                { value: `${key}:descend`, label: `${String(getColumnTitle(column))} ↓` }
              ];
            })}
          />
          {sorterOrder && (
            <Button
              aria-label={t('common.clearSelection')}
              icon={<CloseOutlined />}
              onClick={() => handleSortChange(undefined)}
            />
          )}
        </div>
      )}

      <Spin spinning={isLoading}>
        {visibleData.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />
        ) : (
          <div className="responsive-record-cards">
            {visibleData.map((record, index) => {
              const key = getRecordKey(record, index, rowKey);
              const checked = selectedKeys.includes(key);
              const checkboxProps = rowSelection?.getCheckboxProps?.(record);
              const cardClassName =
                mobileCardVariant === 'summary'
                  ? 'responsive-record-card responsive-record-card--summary'
                  : 'responsive-record-card';
              const cardActions = actionColumns.map((column, actionIndex) => (
                <div
                  className="responsive-record-actions"
                  key={getColumnKey(column) ?? `action-${actionIndex}`}
                >
                  {renderCell(column, record, index)}
                </div>
              ));
              return (
                <Card className={cardClassName} size="small" key={key}>
                  <div className="responsive-record-heading">
                    {rowSelection && (
                      <Checkbox
                        aria-label={t('common.selectRecord', { record: String(key) })}
                        checked={checked}
                        disabled={checkboxProps?.disabled}
                        onChange={(event) => toggleSelected(record, index, event.target.checked)}
                      />
                    )}
                    <div className="responsive-record-identity">
                      {titleColumn && <div className="responsive-record-title">{renderCell(titleColumn, record, index)}</div>}
                      {subtitleColumn && <div className="responsive-record-subtitle">{renderCell(subtitleColumn, record, index)}</div>}
                    </div>
                  </div>

                  {primaryColumns.length > 0 && (
                    <div className="responsive-record-summary">
                      {primaryColumns.map((column) => renderField(column, record, index))}
                    </div>
                  )}

                  {(detailColumns.length > 0 ||
                    (mobileCardVariant === 'summary' && cardActions.length > 0)) && (
                    <details className="responsive-record-details">
                      <summary>{t('common.moreDetails')}</summary>
                      {detailColumns.length > 0 && (
                        <div className="responsive-record-summary">
                          {detailColumns.map((column) => renderField(column, record, index))}
                        </div>
                      )}
                      {mobileCardVariant === 'summary' && cardActions}
                    </details>
                  )}

                  {mobileCardVariant === 'default' && cardActions}
                </Card>
              );
            })}
          </div>
        )}
      </Spin>

      {pagination !== false && total > pageSize && (
        <div className="responsive-record-pagination">
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={total}
            showSizeChanger={false}
            showQuickJumper={false}
            showLessItems
            showTotal={pagination.showTotal}
            onChange={handlePageChange}
          />
          {pagination.showTotal ? null : (
            <span>{`${currentPage} / ${Math.max(1, Math.ceil(total / pageSize))}`}</span>
          )}
        </div>
      )}
      {selectedKeys.length > 0 && rowSelection && (
        <div className="responsive-selection-bar">
          <span>{t('common.selectedCount', { count: selectedKeys.length })}</span>
          <Button
            type="text"
            size="small"
            onClick={() => rowSelection.onChange?.([], [], { type: 'single' })}
          >
            {t('common.clearSelection')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ResponsiveTable;
