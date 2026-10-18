import { useEffect } from 'react';
import { Alert, Avatar, Button, Card, Form, Input, Space, Tag, Typography, message } from 'antd';
import { KeyOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/useAuth';
import { useApi } from '@/hooks/useApi';
import type { User } from '@/auth/auth';
import './profile.css';

interface ProfileUser extends User {
  display_name?: string | null;
  displayName?: string | null;
}

interface ProfileResponse {
  success: boolean;
  data: ProfileUser;
}

interface ChangePasswordResponse {
  success: boolean;
  token?: string;
}

interface ProfileFormValues {
  display_name: string;
}

interface PasswordFormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const getDisplayName = (user: ProfileUser | null): string => {
  const displayName = user?.display_name ?? user?.displayName;
  return typeof displayName === 'string' && displayName.trim() ? displayName : user?.username ?? '';
};

function Profile(): React.ReactElement {
  const { t } = useTranslation();
  const { user, updateSession } = useAuth();
  const { put: updateProfile, loading: profileLoading } = useApi();
  const { put: updatePassword, loading: passwordLoading } = useApi();
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const currentUser = user as ProfileUser | null;
  const displayName = getDisplayName(currentUser);
  const roleLabel = currentUser?.role ? t(`users.${currentUser.role}`) : '';

  useEffect(() => {
    profileForm.setFieldsValue({ display_name: currentUser?.display_name ?? '' });
  }, [currentUser?.display_name, profileForm]);

  const handleProfileSubmit = async ({ display_name }: ProfileFormValues): Promise<void> => {
    const response = await updateProfile<ProfileResponse>('/users/me', {
      display_name: display_name.trim()
    });

    if (response?.success && response.data) {
      const updatedUser = { ...currentUser, ...response.data } as User;
      updateSession({ user: updatedUser });
      message.success(t('users.saveSuccess'));
    }
  };

  const handlePasswordSubmit = async ({ oldPassword, newPassword }: PasswordFormValues): Promise<void> => {
    const response = await updatePassword<ChangePasswordResponse>('/users/me/password', {
      oldPassword,
      newPassword
    });

    if (response?.success) {
      if (response.token) updateSession({ token: response.token });
      passwordForm.resetFields();
      message.success(t('users.passwordChanged'));
    }
  };

  return (
    <div className="profile-page">
      <header className="profile-page-header">
        <Typography.Title level={2}>{t('users.profileTitle')}</Typography.Title>
        <Typography.Paragraph type="secondary">{t('users.profileDescription')}</Typography.Paragraph>
      </header>

      <div className="profile-layout">
        <Card className="profile-overview-card">
          <div className="profile-overview-content">
            <Avatar size={64} icon={<UserOutlined />} />
            <div className="profile-overview-name">
              <Typography.Title level={4}>{displayName}</Typography.Title>
              <Typography.Text type="secondary" className="profile-username">
                {currentUser?.username}
              </Typography.Text>
              <Tag
                className="profile-role-tag"
                color={currentUser?.role === 'superuser' ? 'black' : 'blue'}
              >
                {roleLabel}
              </Tag>
            </div>
          </div>
        </Card>

        <div className="profile-form-sections">
          <Card title={t('users.basicInformation')}>
            <Form<ProfileFormValues>
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileSubmit}
              requiredMark
            >
              <Form.Item label={t('users.username')}>
                <Input value={currentUser?.username ?? ''} readOnly autoComplete="username" />
              </Form.Item>
              <Form.Item
                name="display_name"
                label={t('users.displayName')}
              >
                <Input autoComplete="name" maxLength={100} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={profileLoading}>
                {t('users.save')}
              </Button>
            </Form>
          </Card>

          <Card title={<Space><KeyOutlined />{t('users.changePassword')}</Space>}>
            <Alert
              className="profile-password-hint"
              type="info"
              showIcon
              title={t('users.passwordMinimumHint')}
            />
            <Form<PasswordFormValues>
              form={passwordForm}
              layout="vertical"
              onFinish={handlePasswordSubmit}
              requiredMark
            >
              <Form.Item
                name="oldPassword"
                label={t('users.oldPassword')}
                rules={[{ required: true, message: t('users.oldPasswordRequired') }]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Form.Item
                name="newPassword"
                label={t('users.newPassword')}
                rules={[
                  { required: true, message: t('users.newPasswordRequired') },
                  { min: 6, message: t('users.passwordTooShort') }
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label={t('users.confirmPassword')}
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: t('users.confirmPasswordRequired') },
                  ({ getFieldValue }) => ({
                    validator(_, value: string | undefined) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                      return Promise.reject(new Error(t('users.passwordMismatch')));
                    }
                  })
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={passwordLoading}>
                {t('users.changePasswordButton')}
              </Button>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Profile;
