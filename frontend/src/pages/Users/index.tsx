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
  Switch
} from 'antd';
import { EditOutlined, DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useApi } from '@/hooks/useApi';
import { usePermissions } from '@/auth/usePermissions';
import { useAuth } from '@/auth/useAuth';
import { tokenManager } from '@/auth/auth';

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

interface ChangePasswordResponse {
  success: boolean;
  token?: string;
}

function Users(): React.ReactElement {
  const { t } = useTranslation();
  const { isSuperuser } = usePermissions();
  const { user: currentUser } = useAuth();
  const { get, post, put, delete: del, loading } = useApi();
  const getRef = useRef(get);
  getRef.current = get;

  const [displayName, setDisplayName] = useState((currentUser?.display_name as string) || '');
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
    showTotal: (t_: number) => t('users.total', { count: t_ })
  });

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('reader');
  const [editEnabled, setEditEnabled] = useState(true);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<UserData | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [createRole, setCreateRole] = useState('reader');
  const [createEnabled, setCreateEnabled] = useState(true);

  const fetchUsers = useCallback(async (page = 1, pageSize = 20) => {
    const response = await getRef.current<UsersResponse>(
      `/users?page=${page}&pageSize=${pageSize}`
    );

    if (response?.success) {
      setUserData(response.data.items);
      setTotal(response.data.total);
      setPagination((prev) => ({
        ...prev,
        current: page,
        pageSize,
        total: response.data.total
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
    message.success(t('users.saveSuccess'));
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      message.error(t('users.passwordMismatch'));
      return;
    }

    if (newPassword.length < 6) {
      message.error(t('users.passwordTooShort'));
      return;
    }

    const response = await put<ChangePasswordResponse>('/users/me/password', {
      oldPassword,
      newPassword
    });

    if (response?.token) {
      tokenManager.setToken(response.token);
    }

    message.success(t('users.passwordChanged'));
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
      enabled: editEnabled
    };

    await put(`/users/${editingUser.username}`, payload);

    message.success(t('users.updateSuccess'));
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
      message.error(t('users.passwordTooShort'));
      return;
    }

    await put(`/users/${resettingUser.username}/reset-password`, {
      newPassword: resetPassword
    });

    message.success(t('users.passwordResetSuccess'));
    setResetModalOpen(false);
  };

  const handleDelete = async (username: string) => {
    await del(`/users/${username}`);
    await fetchUsers(pagination.current || 1, pagination.pageSize || 20);
  };

  const handleOpenCreate = () => {
    setCreateUsername('');
    setCreateDisplayName('');
    setCreatePassword('');
    setCreateConfirmPassword('');
    setCreateRole('reader');
    setCreateEnabled(true);
    setCreateModalOpen(true);
  };

  const handleCreate = async () => {
    const username = createUsername.trim();

    if (!username) {
      message.error(t('users.usernameRequired'));
      return;
    }

    if (createPassword.length < 6) {
      message.error(t('users.passwordTooShort'));
      return;
    }

    if (createPassword !== createConfirmPassword) {
      message.error(t('users.passwordMismatch'));
      return;
    }

    await post('/users', {
      username,
      password: createPassword,
      display_name: createDisplayName,
      role: createRole,
      enabled: createEnabled
    });

    message.success(t('users.createSuccess'));
    setCreateModalOpen(false);
    fetchUsers(pagination.current || 1, pagination.pageSize || 20);
  };

  const roleTag = (role: string) => {
    const colorMap: Record<string, string> = {
      superuser: 'black',
      editor: 'green',
      reader: 'blue'
    };
    return <Tag color={colorMap[role] || 'default'}>{role}</Tag>;
  };

  const columns: ColumnsType<UserData> = [
    {
      title: t('users.username'),
      dataIndex: 'username',
      key: 'username',
      width: 150
    },
    {
      title: t('users.displayName'),
      dataIndex: 'display_name',
      key: 'display_name',
      width: 150,
      render: (text: string) => text || '-'
    },
    {
      title: t('users.role'),
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: roleTag
    },
    {
      title: t('users.enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>{enabled ? t('users.yes') : t('users.no')}</Tag>
      )
    },
    {
      title: t('users.actions'),
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
            {t('users.edit')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => handleResetPassword(record)}
          >
            {t('users.resetPassword')}
          </Button>
          <Popconfirm
            title={t('users.deleteConfirm')}
            onConfirm={() => handleDelete(record.username)}
            okText={t('common.yes')}
            cancelText={t('common.no')}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('users.delete')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card title={t('users.myProfile')}>
        <Form layout="inline">
          <Form.Item label={t('users.displayName')} htmlFor="profile-display-name">
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleSaveDisplayName} loading={loading}>
              {t('users.save')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title={t('users.changePassword')}>
        <Form layout="inline">
          <Form.Item label={t('users.oldPassword')} htmlFor="profile-old-password">
            <Input.Password
              id="profile-old-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label={t('users.newPassword')} htmlFor="profile-new-password">
            <Input.Password
              id="profile-new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label={t('users.confirmPassword')} htmlFor="profile-confirm-password">
            <Input.Password
              id="profile-confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleChangePassword} loading={loading}>
              {t('users.changePasswordButton')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {isSuperuser() && (
        <Card
          title={t('users.userList')}
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              {t('users.createUser')}
            </Button>
          }
        >
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
        title={t('users.createUserTitle')}
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={loading}
      >
        <Form layout="vertical">
          <Form.Item label={t('users.username')} htmlFor="create-username">
            <Input
              id="create-username"
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label={t('users.displayName')} htmlFor="create-display-name">
            <Input
              id="create-display-name"
              value={createDisplayName}
              onChange={(e) => setCreateDisplayName(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('users.newPassword')} htmlFor="create-new-password">
            <Input.Password
              id="create-new-password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item label={t('users.confirmPassword')} htmlFor="create-confirm-password">
            <Input.Password
              id="create-confirm-password"
              value={createConfirmPassword}
              onChange={(e) => setCreateConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item label={t('users.role')}>
            <Select value={createRole} onChange={setCreateRole}>
              <Select.Option value="reader">{t('users.reader')}</Select.Option>
              <Select.Option value="editor">{t('users.editor')}</Select.Option>
              <Select.Option value="superuser">{t('users.superuser')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label={t('users.enabled')} valuePropName="checked">
            <Switch checked={createEnabled} onChange={setCreateEnabled} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('users.editUser')}
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => setEditModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('users.username')}>
            <Input value={editingUser?.username} disabled />
          </Form.Item>
          <Form.Item label={t('users.displayName')}>
            <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('users.role')}>
            <Select value={editRole} onChange={setEditRole}>
              <Select.Option value="reader">{t('users.reader')}</Select.Option>
              <Select.Option value="editor">{t('users.editor')}</Select.Option>
              <Select.Option value="superuser">{t('users.superuser')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label={t('users.enabled')} valuePropName="checked">
            <Switch checked={editEnabled} onChange={setEditEnabled} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('users.resetPasswordTitle')}
        open={resetModalOpen}
        onOk={handleResetPasswordConfirm}
        onCancel={() => setResetModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('users.username')}>
            <Input value={resettingUser?.username} disabled />
          </Form.Item>
          <Form.Item label={t('users.newPassword')}>
            <Input.Password
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder={t('users.enterNewPassword')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export default Users;
