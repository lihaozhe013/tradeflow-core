import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Table,
  Modal,
  Select,
  Tag,
  Space,
  Popconfirm,
  message,
  Switch,
} from 'antd';
import { EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useApi } from '@/hooks/useApi';
import { usePermissions } from '@/auth/usePermissions';
import { useAuth } from '@/auth/useAuth';

interface UserData {
  username: string;
  role: string;
  display_name: string | null;
  enabled: boolean;
  last_password_change: string | null;
  created_at: string;
}

interface UsersResponse {
  success: boolean;
  data: {
    items: UserData[];
    total: number;
    page: number;
    pageSize: number;
  };
}

interface UpdateUserPayload {
  display_name?: string;
  role?: string;
  enabled?: boolean;
}

function Users(): React.ReactElement {
  const { t } = useTranslation();
  const { isSuperuser } = usePermissions();
  const { user: currentUser } = useAuth();
  const { get, put, delete: del, loading } = useApi();
  const getRef = useRef(get);
  getRef.current = get;

  const [displayName, setDisplayName] = useState(
    (currentUser?.display_name as string) || '',
  );
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [userData, setUserData] = useState<UserData[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showTotal: (t_: number) =>
      t('users.total', { count: t_, defaultValue: `共 ${t_} 条` }),
  });

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('reader');
  const [editEnabled, setEditEnabled] = useState(true);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<UserData | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const fetchUsers = useCallback(async (page = 1, pageSize = 20) => {
    const response = await getRef.current<UsersResponse>(
      `/users?page=${page}&pageSize=${pageSize}`,
    );

    if (response?.success) {
      setUserData(response.data.items);
      setTotal(response.data.total);
      setPagination((prev) => ({
        ...prev,
        current: page,
        pageSize,
        total: response.data.total,
      }));
    }
  }, []);

  useEffect(() => {
    if (isSuperuser()) {
      fetchUsers(1, 20);
    }
  }, []);

  const handleSaveDisplayName = async () => {
    await put('/users/me', { display_name: displayName });
    message.success(t('users.saveSuccess', { defaultValue: '保存成功' }));
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      message.error(
        t('users.passwordMismatch', {
          defaultValue: '两次输入的密码不一致',
        }),
      );
      return;
    }

    if (newPassword.length < 6) {
      message.error(
        t('users.passwordTooShort', {
          defaultValue: '密码长度至少6位',
        }),
      );
      return;
    }

    await put('/users/me/password', {
      oldPassword,
      newPassword,
    });

    message.success(
      t('users.passwordChanged', { defaultValue: '密码修改成功' }),
    );
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchUsers(pag.current || 1, pag.pageSize || 20);
  };

  const handleEdit = (user: UserData) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
    setEditRole(user.role);
    setEditEnabled(user.enabled);
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingUser) return;

    const payload: UpdateUserPayload = {
      display_name: editDisplayName,
      role: editRole,
      enabled: editEnabled,
    };

    await put(`/users/${editingUser.username}`, payload);

    message.success(t('users.updateSuccess', { defaultValue: '更新成功' }));
    setEditModalOpen(false);
    fetchUsers(pagination.current || 1, pagination.pageSize || 20);
  };

  const handleResetPassword = (user: UserData) => {
    setResettingUser(user);
    setResetPassword('');
    setResetModalOpen(true);
  };

  const handleResetPasswordConfirm = async () => {
    if (!resettingUser) return;

    if (!resetPassword || resetPassword.length < 6) {
      message.error(
        t('users.passwordTooShort', {
          defaultValue: '密码长度至少6位',
        }),
      );
      return;
    }

    await put(`/users/${resettingUser.username}/reset-password`, {
      newPassword: resetPassword,
    });

    message.success(
      t('users.passwordResetSuccess', {
        defaultValue: '密码重置成功',
      }),
    );
    setResetModalOpen(false);
  };

  const handleDelete = async (username: string) => {
    await del(`/users/${username}`);
  };

  const roleTag = (role: string) => {
    const colorMap: Record<string, string> = {
      superuser: 'black',
      editor: 'green',
      reader: 'blue',
    };
    return <Tag color={colorMap[role] || 'default'}>{role}</Tag>;
  };

  const columns: ColumnsType<UserData> = [
    {
      title: t('users.username', { defaultValue: '用户名' }),
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: t('users.displayName', { defaultValue: '显示名称' }),
      dataIndex: 'display_name',
      key: 'display_name',
      width: 150,
      render: (text: string) => text || '-',
    },
    {
      title: t('users.role', { defaultValue: '角色' }),
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: roleTag,
    },
    {
      title: t('users.enabled', { defaultValue: '启用' }),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled
            ? t('users.yes', { defaultValue: '是' })
            : t('users.no', { defaultValue: '否' })}
        </Tag>
      ),
    },
    {
      title: t('users.actions', { defaultValue: '操作' }),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('users.edit', { defaultValue: '编辑' })}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => handleResetPassword(record)}
          >
            {t('users.resetPassword', { defaultValue: '重置密码' })}
          </Button>
          <Popconfirm
            title={t('users.deleteConfirm', {
              defaultValue: '确定要删除该用户吗？',
            })}
            onConfirm={() => handleDelete(record.username)}
            okText={t('common.yes', { defaultValue: '确定' })}
            cancelText={t('common.no', { defaultValue: '取消' })}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('users.delete', { defaultValue: '删除' })}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card title={t('users.myProfile', { defaultValue: '我的资料' })}>
        <Form layout="inline">
          <Form.Item
            label={t('users.displayName', { defaultValue: '显示名称' })}
          >
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              onClick={handleSaveDisplayName}
              loading={loading}
            >
              {t('users.save', { defaultValue: '保存' })}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title={t('users.changePassword', { defaultValue: '修改密码' })}>
        <Form layout="inline">
          <Form.Item label={t('users.oldPassword', { defaultValue: '旧密码' })}>
            <Input.Password
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label={t('users.newPassword', { defaultValue: '新密码' })}>
            <Input.Password
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item
            label={t('users.confirmPassword', { defaultValue: '确认密码' })}
          >
            <Input.Password
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              onClick={handleChangePassword}
              loading={loading}
            >
              {t('users.changePasswordButton', { defaultValue: '修改密码' })}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {isSuperuser() && (
        <Card title={t('users.userList', { defaultValue: '用户列表' })}>
          <Table
            columns={columns}
            dataSource={userData}
            rowKey="username"
            pagination={pagination}
            onChange={handleTableChange}
            loading={loading}
            size="middle"
          />
        </Card>
      )}

      <Modal
        title={t('users.editUser', { defaultValue: '编辑用户' })}
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => setEditModalOpen(false)}
        okText={t('common.confirm', { defaultValue: '确定' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Form layout="vertical">
          <Form.Item label={t('users.username', { defaultValue: '用户名' })}>
            <Input value={editingUser?.username} disabled />
          </Form.Item>
          <Form.Item
            label={t('users.displayName', { defaultValue: '显示名称' })}
          >
            <Input
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('users.role', { defaultValue: '角色' })}>
            <Select value={editRole} onChange={setEditRole}>
              <Select.Option value="reader">
                {t('users.reader', { defaultValue: '读者' })}
              </Select.Option>
              <Select.Option value="editor">
                {t('users.editor', { defaultValue: '编辑者' })}
              </Select.Option>
              <Select.Option value="superuser">
                {t('users.superuser', { defaultValue: '超级用户' })}
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label={t('users.enabled', { defaultValue: '启用' })}
            valuePropName="checked"
          >
            <Switch checked={editEnabled} onChange={setEditEnabled} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('users.resetPasswordTitle', { defaultValue: '重置密码' })}
        open={resetModalOpen}
        onOk={handleResetPasswordConfirm}
        onCancel={() => setResetModalOpen(false)}
        okText={t('common.confirm', { defaultValue: '确定' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Form layout="vertical">
          <Form.Item label={t('users.username', { defaultValue: '用户名' })}>
            <Input value={resettingUser?.username} disabled />
          </Form.Item>
          <Form.Item label={t('users.newPassword', { defaultValue: '新密码' })}>
            <Input.Password
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder={t('users.enterNewPassword', {
                defaultValue: '请输入新密码',
              })}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export default Users;
