import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Menu, Layout, Alert, Select, Space, Dropdown, Button, Tag } from 'antd';
import type { MenuProps, SelectProps } from 'antd';
import { GlobalOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import Inbound from '@/pages/Inbound';
import Outbound from '@/pages/Outbound';
import Inventory from '@/pages/Inventory';
import Partners from '@/pages/Partners';
import Products from '@/pages/Products';
import ProductPrices from '@/pages/ProductPrices';
import Export from '@/pages/Export';
import Overview from '@/pages/Overview';
import Receivable from '@/pages/Receivable';
import Payable from '@/pages/Payable';
import Analysis from '@/pages/Analysis';
import About from '@/pages/About';
import { AuthProvider } from '@/auth/AuthContext';
import { useAuth } from '@/auth/useAuth';
import ProtectedRoute from '@/auth/ProtectedRoute';
import LoginPage from '@/pages/Login/LoginPage';
import type { User } from '@/auth/auth';
import '@/App.css';

const { Header, Content, Footer } = Layout;

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error: ', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <Alert
            message="Page loading error."
            description="An error occurred while rendering the page component. Please refresh the page and try again. If the issue persists, check whether the backend service is functioning properly."
            type="error"
            showIcon
            action={
              <button type="button" onClick={() => window.location.reload()}>
                Refresh
              </button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

const resolveDisplayName = (currentUser: User | null): string | undefined => {
  if (!currentUser) {
    return undefined;
  }

  if ('display_name' in currentUser) {
    const { display_name } = currentUser as { display_name?: unknown };
    if (typeof display_name === 'string' && display_name.trim().length > 0) {
      return display_name;
    }
  }

  if ('displayName' in currentUser) {
    const { displayName } = currentUser as { displayName?: unknown };
    if (typeof displayName === 'string' && displayName.trim().length > 0) {
      return displayName;
    }
  }

  return currentUser.username;
};

const getRoleColor = (role: User['role'] | undefined): string => {
  if (role === 'editor') {
    return 'green';
  }
  return 'blue';
};

const getRoleText = (role: User['role'] | undefined): string => {
  if (role === 'editor') {
    return 'Editor';
  }
  return 'Viewer';
};

function UserMenu(): React.ReactElement {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const displayName = resolveDisplayName(user) ?? t('common.user');

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      label: (
        <Space>
          <UserOutlined />
          <span>{displayName}</span>
        </Space>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: (
        <Space>
          <LogoutOutlined />
          <span>{t('common.logout')}</span>
        </Space>
      ),
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
    }
  };

  return (
    <Space>
      <Tag color={getRoleColor(user?.role)}>{getRoleText(user?.role)}</Tag>
      <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight">
        <Button type="text" style={{ color: 'white' }}>
          <Space>
            <UserOutlined />
            <span>{displayName}</span>
          </Space>
        </Button>
      </Dropdown>
    </Space>
  );
}

type LanguageValue = 'zh' | 'en' | 'ko';

interface LanguageOption {
  readonly value: LanguageValue;
  readonly label: string;
  readonly flag: string;
}

const supportedLanguages: readonly LanguageValue[] = ['zh', 'en', 'ko'] as const;

function LanguageSelector(): React.ReactElement {
  const { i18n, t } = useTranslation();

  const languageOptions: LanguageOption[] = [
    { value: 'zh', label: t('common.chinese'), flag: '🇨🇳' },
    { value: 'en', label: t('common.english'), flag: '🇺🇸' },
    { value: 'ko', label: t('common.korean'), flag: '🇰🇷' },
  ];

  const selectOptions: SelectProps<LanguageValue>['options'] = languageOptions.map((option) => ({
    value: option.value,
    label: (
      <Space>
        <span>{option.flag}</span>
        <span>{option.label}</span>
      </Space>
    ),
  }));

  const currentLanguage = supportedLanguages.includes(i18n.language as LanguageValue)
    ? (i18n.language as LanguageValue)
    : 'zh';

  const handleLanguageChange = (value: LanguageValue) => {
    void i18n.changeLanguage(value);
  };

  return (
    <Space>
      <GlobalOutlined style={{ color: '#666' }} />
      <Select
        value={currentLanguage}
        onChange={handleLanguageChange}
        style={{ minWidth: 120 }}
        size="small"
        options={selectOptions}
      />
    </Space>
  );
}

function AppContent(): React.ReactElement {
  const location = useLocation();
  const { t } = useTranslation();

  return <AppContentInner location={location} t={t} />;
}

type MenuKey =
  | 'overview'
  | 'inbound'
  | 'outbound'
  | 'inventory'
  | 'partners'
  | 'products'
  | 'product-prices'
  | 'receivable'
  | 'payable'
  | 'analysis'
  | 'export';

interface AppContentInnerProps {
  readonly location: Location;
  readonly t: TFunction;
}

function AppContentInner({ location, t }: AppContentInnerProps): React.ReactElement {
  const getSelectedKey = (): MenuKey | '' => {
    const path = location.pathname;
    if (path === '/overview' || path === '/') return 'overview';
    if (path === '/inbound') return 'inbound';
    if (path === '/outbound') return 'outbound';
    if (path === '/inventory') return 'inventory';
    if (path === '/partners') return 'partners';
    if (path === '/products') return 'products';
    if (path === '/product-prices') return 'product-prices';
    if (path === '/receivable') return 'receivable';
    if (path === '/payable') return 'payable';
    if (path === '/analysis') return 'analysis';
    if (path === '/export') return 'export';
    if (path === '/about') return '';
    return 'overview';
  };

  const menuItems: Required<MenuProps>['items'] = [
    {
      key: 'overview',
      label: (
        <Link to="/overview" style={{ fontWeight: 'bold' }}>
          {t('nav.overview')}
        </Link>
      ),
    },
    {
      key: 'inbound',
      label: (
        <Link to="/inbound" style={{ fontWeight: 'bold' }}>
          {t('nav.inbound')}
        </Link>
      ),
    },
    {
      key: 'outbound',
      label: (
        <Link to="/outbound" style={{ fontWeight: 'bold' }}>
          {t('nav.outbound')}
        </Link>
      ),
    },
    {
      key: 'inventory',
      label: (
        <Link to="/inventory" style={{ fontWeight: 'bold' }}>
          {t('nav.inventory')}
        </Link>
      ),
    },
    {
      key: 'partners',
      label: (
        <Link to="/partners" style={{ fontWeight: 'bold' }}>
          {t('nav.partners')}
        </Link>
      ),
    },
    {
      key: 'products',
      label: (
        <Link to="/products" style={{ fontWeight: 'bold' }}>
          {t('nav.products')}
        </Link>
      ),
    },
    {
      key: 'product-prices',
      label: (
        <Link to="/product-prices" style={{ fontWeight: 'bold' }}>
          {t('nav.productPrices')}
        </Link>
      ),
    },
    {
      key: 'receivable',
      label: (
        <Link to="/receivable" style={{ fontWeight: 'bold' }}>
          {t('nav.receivable')}
        </Link>
      ),
    },
    {
      key: 'payable',
      label: (
        <Link to="/payable" style={{ fontWeight: 'bold' }}>
          {t('nav.payable')}
        </Link>
      ),
    },
    {
      key: 'analysis',
      label: (
        <Link to="/analysis" style={{ fontWeight: 'bold' }}>
          {t('nav.analysis')}
        </Link>
      ),
    },
    {
      key: 'export',
      label: (
        <Link to="/export" style={{ fontWeight: 'bold' }}>
          {t('nav.export')}
        </Link>
      ),
    },
  ];

  const selectedKey = getSelectedKey();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          padding: '0 24px',
          height: '50px',
          lineHeight: '50px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: 1 }}>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={menuItems}
            style={{ lineHeight: '50px', background: 'transparent' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <UserMenu />
          <Link to="/about">
            <img
              src="/logo.svg"
              alt={t('common.logoAlt', { defaultValue: 'Tradeflow logo' })}
              className="header-logo"
            />
          </Link>
        </div>
      </Header>
      <Content style={{ padding: '25px', background: '#f0f2f5', marginTop: '0px' }}>
        <div style={{ maxWidth: '1800px', margin: '0 auto' }}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/inbound" element={<Inbound />} />
              <Route path="/outbound" element={<Outbound />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/partners" element={<Partners />} />
              <Route path="/products" element={<Products />} />
              <Route path="/product-prices" element={<ProductPrices />} />
              <Route path="/receivable" element={<Receivable />} />
              <Route path="/payable" element={<Payable />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/export" element={<Export />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </Content>
      <Footer
        style={{
          textAlign: 'center',
          background: '#fff',
          borderTop: '1px solid #e8e8e8',
          padding: '12px 24px',
        }}
      >
        <Space>
          <span style={{ color: '#666' }}>{t('common.language')}:</span>
          <LanguageSelector />
        </Space>
      </Footer>
    </Layout>
  );
}

function App(): React.ReactElement {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <AppContent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
