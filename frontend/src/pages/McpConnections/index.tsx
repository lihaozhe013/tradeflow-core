import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Modal, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import ResponsiveTable from '@/components/ResponsiveTable';
import { apiRequest, RequestError } from '@/utils/request';

interface Connection {
  id: string;
  client: 'opencode' | 'workbuddy';
  deviceId: string;
  tools: string[];
  effectiveTools: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'active' | 'revoked' | 'expired' | 'password_changed';
}
interface ListResponse {
  data: Connection[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
const states = ['active', 'revoked', 'expired', 'password_changed'] as const;
export default function McpConnections(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Connection[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<'authDisabled' | 'failed' | null>(null);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [results, setResults] = useState<Array<{ id: string; ok: boolean }>>([]);
  const [revoking, setRevoking] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) query.set('status', status);
      const [list, capabilities] = await Promise.all([
        apiRequest.get<ListResponse>(`/mcp/connections?${query}`),
        apiRequest.get<{ data: { enabled: boolean } }>('/mcp/capabilities')
      ]);
      if (current !== sequence.current) return;
      setItems(list.data);
      setTotal(list.pagination.total);
      setEnabled(capabilities.data.enabled);
      setSelected([]);
    } catch (failure) {
      if (current !== sequence.current) return;
      const code = failure instanceof RequestError ? (failure.data as { code?: string })?.code : '';
      setError(code === 'AUTH_DISABLED' ? 'authDisabled' : 'failed');
      setItems([]);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page, limit, status]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  async function revoke(ids: string[]) {
    setConfirmIds([]);
    setRevoking(true);
    const outcomes: Array<{ id: string; ok: boolean }> = [];
    for (const id of ids) {
      try {
        await apiRequest.delete(`/mcp/connections/${id}`);
        outcomes.push({ id, ok: true });
      } catch {
        outcomes.push({ id, ok: false });
      }
      setResults([...outcomes]);
    }
    await load();
    setRevoking(false);
  }
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US');
  const columns: ColumnsType<Connection> = [
    {
      title: t('mcpConnections.agent'),
      dataIndex: 'client',
      width: 130,
      render: (client: string) => (client === 'opencode' ? 'OpenCode' : 'WorkBuddy')
    },
    {
      title: t('mcpConnections.identification'),
      key: 'identification',
      width: 260,
      render: (_, item) => (
        <div style={{ overflowWrap: 'anywhere' }}>
          <div>
            {t('mcpConnections.id')}: {item.id}
          </div>
          <small>
            {t('mcpConnections.device')}: {item.deviceId}
          </small>
        </div>
      )
    },
    {
      title: t('mcpConnections.status'),
      dataIndex: 'status',
      width: 130,
      render: (value: string) => (
        <Tag color={value === 'active' ? 'green' : 'default'}>
          {t(`mcpConnections.states.${value}`)}
        </Tag>
      )
    },
    {
      title: t('mcpConnections.dates'),
      key: 'dates',
      width: 200,
      render: (_, item) => (
        <>
          <div>
            {t('mcpConnections.created')}: {formatDate(item.createdAt)}
          </div>
          <div>
            {t('mcpConnections.expires')}: {formatDate(item.expiresAt)}
          </div>
        </>
      )
    },
    {
      title: t('mcpConnections.tools'),
      key: 'tools',
      width: 260,
      render: (_, item) => (
        <details>
          <summary>
            {item.effectiveTools.length} / {item.tools.length}
          </summary>
          <div>
            {t('mcpConnections.granted')}: {item.tools.join(', ')}
          </div>
          <div>
            {t('mcpConnections.effective')}: {item.effectiveTools.join(', ') || '—'}
          </div>
        </details>
      )
    },
    {
      title: t('mcpConnections.actions'),
      key: 'actions',
      width: 100,
      render: (_, item) => (
        <Button
          danger
          disabled={revoking || loading || item.status === 'revoked'}
          onClick={() => setConfirmIds([item.id])}
        >
          {t('mcpConnections.revoke')}
        </Button>
      )
    }
  ];
  const failedIds = results.filter((item) => !item.ok).map((item) => item.id);
  return (
    <Card title={<h2 style={{ margin: 0, fontSize: 18 }}>{t('mcpConnections.title')}</h2>}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={t('mcpConnections.scope')}
          description={t('mcpConnections.explanation', { server: window.location.origin })}
        />
        {!enabled && <Alert type="warning" message={t('mcpConnections.disabled')} />}
        {error && <Alert type="error" role="alert" message={t(`mcpConnections.${error}`)} />}
        <Space wrap>
          <Select
            aria-label={t('mcpConnections.filter')}
            value={status}
            style={{ width: 190 }}
            disabled={revoking}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: '', label: t('mcpConnections.all') },
              ...states.map((value) => ({ value, label: t(`mcpConnections.states.${value}`) }))
            ]}
          />
          <Button disabled={loading || revoking} onClick={() => void load()}>
            {t('mcpConnections.refresh')}
          </Button>
          <Button
            danger
            disabled={!selected.length || revoking || loading}
            onClick={() => setConfirmIds(selected.map(String))}
          >
            {t('mcpConnections.revokeSelected')}
          </Button>
        </Space>
        {results.length > 0 && (
          <Alert
            type={failedIds.length ? 'warning' : 'success'}
            message={t('mcpConnections.result', {
              succeeded: results.length - failedIds.length,
              total: results.length
            })}
            description={
              <>
                {results.map((item) => (
                  <div key={item.id}>
                    {item.id}:{' '}
                    {t(item.ok ? 'mcpConnections.states.revoked' : 'mcpConnections.failed')}
                  </div>
                ))}
                {failedIds.length > 0 && (
                  <Button disabled={revoking} onClick={() => setConfirmIds(failedIds)}>
                    {t('mcpConnections.retry')}
                  </Button>
                )}
              </>
            }
          />
        )}
        <ResponsiveTable<Connection>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading || revoking}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (item) => ({ disabled: item.status === 'revoked' || revoking })
          }}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            onChange: (nextPage, nextLimit) => {
              setPage(nextPage);
              setLimit(nextLimit);
            }
          }}
        />
      </Space>
      <Modal
        title={t('mcpConnections.confirmTitle')}
        open={confirmIds.length > 0}
        onCancel={() => setConfirmIds([])}
        onOk={() => void revoke(confirmIds)}
        okText={t('mcpConnections.revoke')}
        cancelText={t('mcpConnections.cancel')}
        okButtonProps={{ danger: true }}
      >
        {t('mcpConnections.confirm', { count: confirmIds.length })}
      </Modal>
    </Card>
  );
}
