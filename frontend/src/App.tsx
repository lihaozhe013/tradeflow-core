import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Menu, Layout, Alert, Space, Dropdown, Button, Tag, Drawer, Grid } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  DatabaseOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
  SwapOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined
} from '@ant-design/icons';
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
import Audit from '@/pages/Audit';
import Users from '@/pages/Users';
import { AuthProvider } from '@/auth/AuthContext';
import { useAuth } from '@/auth/useAuth';
import { usePermissions } from '@/auth/usePermissions';
import ProtectedRoute from '@/auth/ProtectedRoute';
import LoginPage from '@/pages/Login/LoginPage';
import LanguageSelector from '@/components/LanguageSelector';
import type { User } from '@/auth/auth';
import '@/App.css';

const { Header, Content, Sider } = Layout;

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
  if (role === 'superuser') {
    return 'black';
  }
  if (role === 'editor') {
    return 'green';
  }
  return 'blue';
};

const getRoleText = (role: User['role'] | undefined): string => {
  if (role === 'superuser') {
    return 'Superuser';
  }
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
      disabled: true
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: (
        <Space>
          <LogoutOutlined />
          <span>{t('common.logout')}</span>
        </Space>
      )
    }
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
    }
  };

  return (
    <>
      <Dropdown
        menu={{ items: userMenuItems, onClick: handleMenuClick }}
        placement="bottomRight"
        dropdownRender={(menu) => (
          <div className="user-menu-dropdown">
            {menu}
            <div className="user-menu-language">
              <span>{t('common.language')}</span>
              <LanguageSelector minWidth={150} />
            </div>
          </div>
        )}
      >
        <Button type="text" className="user-menu-trigger">
          <Space>
            <UserOutlined />
            <span>{displayName}</span>
          </Space>
        </Button>
      </Dropdown>
    </>
  );
}

function HomeRedirect(): React.ReactElement {
  const { hasPermission } = useAuth();
  const defaultPath = hasPermission('editor') ? '/overview' : '/inbound';

  return <Navigate to={defaultPath} replace />;
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
  | 'export'
  | 'audit'
  | 'users'
  | 'about';

interface AppContentInnerProps {
  readonly location: Location;
  readonly t: TFunction;
}

function AppContentInner({ location, t }: AppContentInnerProps): React.ReactElement {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const canAccessRestrictedPages = hasPermission('editor');
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isWideViewport, setIsWideViewport] = useState(() =>
    window.matchMedia('(min-width: 1440px)').matches
  );
  const [collapsed, setCollapsed] = useState(() => !window.matchMedia('(min-width: 1440px)').matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1440px)');
    const updateViewport = (): void => setIsWideViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    setCollapsed(!isWideViewport);
  }, [isWideViewport]);

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
    if (path === '/audit') return 'audit';
    if (path === '/users') return 'users';
    if (path === '/about') return 'about';
    return 'overview';
  };

  const menuItems = useMemo<Required<MenuProps>['items']>(() => {
    const linkItem = (key: MenuKey, path: string, label: string) => ({
      key,
      label: <Link to={path}>{label}</Link>
    });
    const operationItems = [
      linkItem('inbound', '/inbound', t('nav.inbound')),
      linkItem('outbound', '/outbound', t('nav.outbound')),
      linkItem('inventory', '/inventory', t('nav.inventory'))
    ];
    const masterDataItems = [
      linkItem('partners', '/partners', t('nav.partners')),
      linkItem('products', '/products', t('nav.products')),
      linkItem('product-prices', '/product-prices', t('nav.productPrices'))
    ];
    const administrationItems = [
      linkItem('audit', '/audit', t('nav.audit')),
      linkItem('users', '/users', t('nav.users'))
    ];

    return [
      ...(canAccessRestrictedPages
        ? [
            {
              key: 'overview',
              icon: <AppstoreOutlined />,
              label: <Link to="/overview">{t('nav.overview')}</Link>
            }
          ]
        : []),
      {
        key: 'operations',
        icon: <SwapOutlined />,
        label: t('nav.operations'),
        children: operationItems
      },
      {
        key: 'master-data',
        icon: <DatabaseOutlined />,
        label: t('nav.masterData'),
        children: masterDataItems
      },
      ...(canAccessRestrictedPages
        ? [
            {
              key: 'finance',
              icon: <DollarOutlined />,
              label: t('nav.finance'),
              children: [
                linkItem('receivable', '/receivable', t('nav.receivable')),
                linkItem('payable', '/payable', t('nav.payable')),
                linkItem('analysis', '/analysis', t('nav.analysis')),
                linkItem('export', '/export', t('nav.export'))
              ]
            }
          ]
        : []),
      {
        key: 'administration',
        icon: <SettingOutlined />,
        label: t('nav.administration'),
        children: administrationItems
      },
      {
        key: 'about',
        icon: <InfoCircleOutlined />,
        label: <Link to="/about">{t('about.title')}</Link>
      }
    ];
  }, [canAccessRestrictedPages, t]);

  const selectedKey = getSelectedKey();
  const openGroupKey = selectedKey === 'inbound' || selectedKey === 'outbound' || selectedKey === 'inventory'
    ? 'operations'
    : selectedKey === 'partners' || selectedKey === 'products' || selectedKey === 'product-prices'
      ? 'master-data'
      : selectedKey === 'receivable' || selectedKey === 'payable' || selectedKey === 'analysis' || selectedKey === 'export'
        ? 'finance'
        : selectedKey === 'audit' || selectedKey === 'users'
          ? 'administration'
          : '';
  const [openKeys, setOpenKeys] = useState<string[]>(openGroupKey ? [openGroupKey] : []);
  useEffect(() => {
    if (openGroupKey) setOpenKeys([openGroupKey]);
  }, [openGroupKey]);
  const selectedLabelKey: Partial<Record<MenuKey, string>> = {
    overview: 'nav.overview',
    inbound: 'nav.inbound',
    outbound: 'nav.outbound',
    inventory: 'nav.inventory',
    partners: 'nav.partners',
    products: 'nav.products',
    'product-prices': 'nav.productPrices',
    receivable: 'nav.receivable',
    payable: 'nav.payable',
    analysis: 'nav.analysis',
    export: 'nav.export',
    audit: 'nav.audit',
    users: 'nav.users',
    about: 'about.title'
  };
  const pageTitle = t(selectedLabelKey[selectedKey as MenuKey] ?? 'nav.inbound');

  const navigation = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      openKeys={collapsed && !isMobile ? undefined : openKeys}
      onOpenChange={setOpenKeys}
      onClick={() => setMobileNavOpen(false)}
      items={menuItems}
      inlineCollapsed={collapsed && !isMobile}
    />
  );

  return (
    <Layout className="app-shell-layout">
      {!isMobile && (
        <Sider
          className="app-sidebar"
          theme="light"
          width={232}
          collapsedWidth={68}
          collapsed={collapsed}
          trigger={null}
        >
          <Link to="/about" className={`app-brand${collapsed ? ' is-collapsed' : ''}`}>
            <img src="/logo.svg" alt={t('common.logoAlt', { defaultValue: 'Tradeflow logo' })} />
            {!collapsed && <span>TradeFlow</span>}
          </Link>
          {navigation}
        </Sider>
      )}
      <Layout className="app-main-layout">
        <Header className="app-topbar">
          <div className="app-topbar-start">
            <Button
              type="text"
              className="navigation-toggle"
              aria-label={isMobile ? t('nav.openNavigation') : t('nav.toggleNavigation')}
              icon={isMobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() =>
                isMobile ? setMobileNavOpen(true) : setCollapsed((value) => !value)
              }
            />
            {isMobile && <span className="mobile-page-title">{pageTitle}</span>}
          </div>
          <div className="app-topbar-end">
            <Tag color={getRoleColor(user?.role)} className="topbar-role-tag">
              {getRoleText(user?.role)}
            </Tag>
            <UserMenu />
          </div>
        </Header>
        <Content className="app-content">
          <div className="app-page-container">
            <ErrorBoundary>
              <Routes>
              <Route
                path="/overview"
                element={
                  <ProtectedRoute requireRole="editor">
                    <Overview />
                  </ProtectedRoute>
                }
              />
              <Route path="/inbound" element={<Inbound />} />
              <Route path="/outbound" element={<Outbound />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/partners" element={<Partners />} />
              <Route path="/products" element={<Products />} />
              <Route path="/product-prices" element={<ProductPrices />} />
              <Route
                path="/receivable"
                element={
                  <ProtectedRoute requireRole="editor">
                    <Receivable />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payable"
                element={
                  <ProtectedRoute requireRole="editor">
                    <Payable />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analysis"
                element={
                  <ProtectedRoute requireRole="editor">
                    <Analysis />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/export"
                element={
                  <ProtectedRoute requireRole="editor">
                    <Export />
                  </ProtectedRoute>
                }
              />
              <Route path="/audit" element={<Audit />} />
              <Route
                path="/users"
                element={
                  <ProtectedRoute>
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<HomeRedirect />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </Content>
      </Layout>
      <Drawer
        title={
          <Link to="/about" className="app-brand" onClick={() => setMobileNavOpen(false)}>
            <img src="/logo.svg" alt={t('common.logoAlt', { defaultValue: 'Tradeflow logo' })} />
            <span>TradeFlow</span>
          </Link>
        }
        placement="left"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        width={300}
        className="mobile-navigation-drawer"
        styles={{ body: { padding: 8 } }}
      >
        {navigation}
      </Drawer>
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
            path="/"
            element={
              <ProtectedRoute>
                <HomeRedirect />
              </ProtectedRoute>
            }
          />
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
