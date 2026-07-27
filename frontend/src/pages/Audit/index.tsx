import { useState, useCallback } from 'react';
import {
  Table,
  Card,
  Input,
  Button,
  Space,
  DatePicker,
  Tag,
  message,
} from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useApi } from '@/hooks/useApi';
import { usePermissions } from '@/auth/usePermissions';

const { RangePicker } = DatePicker;

interface SystemLog {
  id: number;
  username: string | null;
  action: string;
  resource: string;
  user_agent: string | null;
  params: string | null;
  created_at: string;
}

interface AuditLogsResponse {
  success: boolean;
  data: {
    items: SystemLog[];
    total: number;
    page: number;
    pageSize: number;
  };
}

function Audit(): React.ReactElement {
  const { t } = useTranslation();
  const { isSuperuser } = usePermissions();
  const { get, loading } = useApi();

  const [data, setData] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (t_: number) =>
      t('audit.total', { count: t_, defaultValue: `共 ${t_} 条` }),
  });

  const [usernameFilter, setUsernameFilter] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    null,
    null,
  ]);

  const fetchData = useCallback(
    async (page = 1, pageSize = 20) => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('pageSize', String(pageSize));

      if (isSuperuser() && usernameFilter.trim()) {
        params.append('username', usernameFilter.trim());
      }

      if (dateRange[0]) {
        params.append('startDate', dateRange[0].toISOString());
      }
      if (dateRange[1]) {
        params.append('endDate', dateRange[1].toISOString());
      }

      const response = await get<AuditLogsResponse>(
        `/audit/logs?${params.toString()}`,
      );

      if (response?.success) {
        setData(response.data.items);
        setTotal(response.data.total);
        setPagination((prev) => ({
          ...prev,
          current: page,
          pageSize,
          total: response.data.total,
        }));
      }
    },
    [get, isSuperuser, usernameFilter, dateRange],
  );

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchData(pag.current || 1, pag.pageSize || 20);
  };

  const handleSearch = () => {
    fetchData(1, pagination.pageSize || 20);
  };

  const handleReset = () => {
    setUsernameFilter('');
    setDateRange([null, null]);
    setPagination((prev) => ({ ...prev, current: 1 }));
    fetchData(1, pagination.pageSize || 20);
  };

  const getActionTag = (action: string) => {
    const colorMap: Record<string, string> = {
      POST: 'green',
      PUT: 'blue',
      DELETE: 'red',
      PATCH: 'orange',
    };
    return <Tag color={colorMap[action] || 'default'}>{action}</Tag>;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        message.success('已复制到剪贴板');
      })
      .catch(() => {
        message.error('复制失败');
      });
  };

  const getCellProps = (text: string | null) => ({
    style: { cursor: 'pointer' },
    title: '点击复制',
    onClick: () => {
      if (text) copyToClipboard(text);
    },
  });

  const columns: ColumnsType<SystemLog> = [
    {
      title: t('audit.createdAt', { defaultValue: '操作时间' }),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString(),
      onCell: (record) =>
        getCellProps(new Date(record.created_at).toLocaleString()),
    },
    {
      title: t('audit.username', { defaultValue: '用户名' }),
      dataIndex: 'username',
      key: 'username',
      width: 120,
      onCell: (record) => getCellProps(record.username),
    },
    {
      title: t('audit.action', { defaultValue: '操作类型' }),
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: getActionTag,
      onCell: (record) => getCellProps(record.action),
    },
    {
      title: t('audit.resource', { defaultValue: '请求路径' }),
      dataIndex: 'resource',
      key: 'resource',
      width: 200,
      ellipsis: true,
      onCell: (record) => getCellProps(record.resource),
    },
    {
      title: t('audit.params', { defaultValue: '请求参数' }),
      dataIndex: 'params',
      key: 'params',
      width: 600,
      ellipsis: true,
      render: (text: string) => {
        if (!text) return '-';
        try {
          const parsed = JSON.parse(text);
          return JSON.stringify(parsed);
        } catch {
          return text;
        }
      },
      onCell: (record) => getCellProps(record.params),
    },
  ];

  return (
    <Card title={t('audit.title', { defaultValue: '审计日志' })}>
      <Space style={{ marginBottom: 16 }} wrap>
        {isSuperuser() && (
          <Input
            placeholder={t('audit.searchUser', {
              defaultValue: '按用户名搜索',
            })}
            value={usernameFilter}
            onChange={(e) => setUsernameFilter(e.target.value)}
            style={{ width: 200 }}
            onPressEnter={handleSearch}
          />
        )}
        <RangePicker
          value={dateRange as [Dayjs | null, Dayjs | null]}
          onChange={(dates) =>
            setDateRange(dates as [Dayjs | null, Dayjs | null])
          }
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={loading}
        >
          {t('audit.search', { defaultValue: '查询' })}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          {t('common.reset', { defaultValue: '重置' })}
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        pagination={pagination}
        onChange={handleTableChange}
        loading={loading}
        size="middle"
        scroll={{ x: 900 }}
      />
    </Card>
  );
}

export default Audit;
