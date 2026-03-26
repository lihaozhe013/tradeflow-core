import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Spin, Select, Space } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuth } from '@/auth/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import '@/pages/Login/LoginPage.css';
import { useTranslation } from 'react-i18next';

/**
 * 登录表单值接口
 */
interface LoginFormValues {
  username: string;
  password: string;
}

/**
 * 登录页面组件
 *
 * 提供用户登录界面和认证功能
 *
 * @example
 * ```tsx
 * <Route path="/login" element={<LoginPage />} />
 * ```
 */
const LoginPage: React.FC = () => {
  const [form] = Form.useForm<LoginFormValues>();
  const { login, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginLoading, setLoginLoading] = useState(false);
  const { t, i18n } = useTranslation();

  // 获取重定向路径
  const from =
    (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname ?? '/';

  // 语言选项
  type LanguageValue = 'zh' | 'en' | 'ko';
  const supportedLanguages: readonly LanguageValue[] = ['zh', 'en', 'ko'] as const;

  const languageOptions = [
    { value: 'zh', label: '🇨🇳 中文', flag: '🇨🇳' },
    { value: 'en', label: '🇺🇸 English', flag: '🇺🇸' },
    { value: 'ko', label: '🇰🇷 한국어', flag: '🇰🇷' },
  ];

  const currentLanguage = supportedLanguages.includes(i18n.language as LanguageValue)
    ? (i18n.language as LanguageValue)
    : 'zh';

  const handleLanguageChange = (value: LanguageValue) => {
    void i18n.changeLanguage(value);
  };

  /**
   * 处理表单提交
   */
  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    setLoginLoading(true);
    clearError();

    try {
      const result = await login(values.username, values.password);

      if (result.success) {
        // 登录成功，重定向到之前的页面或首页
        navigate(from, { replace: true });
      }
    } finally {
      setLoginLoading(false);
    }
  };

  /**
   * 处理用户名输入变化
   */
  const handleUsernameChange = (): void => {
    // 清除错误信息当用户开始输入时
    if (error) {
      clearError();
    }
  };

  if (isLoading) {
    return (
      <div className="login-container">
        <div className="login-loading">
          <Spin size="large" />
          <p>{t('auth.verifying')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <Card className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <img src="/logo.svg" alt="Logo" className="logo-image" />
            </div>
            <h1 className="login-title">{t('auth.title')}</h1>
            <p className="login-subtitle">{t('auth.subtitle')}</p>
          </div>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={clearError}
              style={{ marginBottom: 24 }}
            />
          )}

          <Form<LoginFormValues>
            form={form}
            name="login"
            onFinish={handleSubmit}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                {
                  required: true,
                  message: t('auth.usernameRequired'),
                },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder={t('auth.username')}
                onChange={handleUsernameChange}
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                {
                  required: true,
                  message: t('auth.passwordRequired'),
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={t('auth.password')}
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                className="login-button"
                loading={loginLoading}
                icon={<LoginOutlined />}
                block
              >
                {loginLoading ? t('auth.loggingIn') : t('auth.login')}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <Space>
          <GlobalOutlined style={{ color: '#666' }} />
          <Select
            value={currentLanguage}
            onChange={handleLanguageChange}
            style={{ minWidth: 140 }}
            size="small"
            options={languageOptions}
          />
        </Space>
      </div>
    </div>
  );
};

export default LoginPage;
