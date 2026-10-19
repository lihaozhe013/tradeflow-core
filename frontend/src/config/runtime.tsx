import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Alert, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/useAuth';
import api from '@/utils/request';

export interface RuntimeSettings {
  currency_unit_symbol: string;
  paymentMethods: { list: string[]; default: string };
  productCategories: { list: string[]; default: string };
}
function validateRuntime(value: unknown): RuntimeSettings {
  if (!value || typeof value !== 'object') throw new Error('Invalid runtime settings.');
  const data = value as RuntimeSettings;
  if (
    typeof data.currency_unit_symbol !== 'string' ||
    !data.currency_unit_symbol.trim() ||
    ![data.paymentMethods, data.productCategories].every(
      (group) =>
        group &&
        Array.isArray(group.list) &&
        group.list.length &&
        group.list.every((item) => typeof item === 'string') &&
        group.list.includes(group.default)
    )
  )
    throw new Error('Invalid runtime settings.');
  return data;
}
const Context = createContext<{ data: RuntimeSettings; refresh: () => Promise<void> } | null>(null);
export function RuntimeSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<RuntimeSettings | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = validateRuntime(await api.get<unknown>('/settings/runtime'));
      if (current === generation.current) {
        setData(next);
        setError(false);
      }
    } catch {
      if (current === generation.current) setError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setData(null);
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      generation.current++;
      window.removeEventListener('focus', focus);
    };
  }, [user?.username, refresh]);
  if (!data)
    return (
      <div className="settings-loading">
        {error ? (
          <Alert
            type="error"
            showIcon
            title={t('settings.loadFailed')}
            action={
              <Button loading={loading} onClick={() => void refresh()}>
                {t('settings.retry')}
              </Button>
            }
          />
        ) : (
          <Spin size="large" />
        )}
      </div>
    );
  return (
    <Context.Provider value={{ data, refresh }}>
      {error && (
        <Alert
          type="warning"
          showIcon
          title={t('settings.refreshFailed')}
          action={<Button onClick={() => void refresh()}>{t('settings.retry')}</Button>}
        />
      )}
      {children}
    </Context.Provider>
  );
}
export function useRuntimeConfig(): RuntimeSettings {
  const value = useContext(Context);
  if (!value) throw new Error('Runtime settings provider is required.');
  return value.data;
}
export function useRefreshRuntimeSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('Runtime settings provider is required.');
  return value.refresh;
}
export function withHistoricalOption(list: readonly string[], current?: string | null) {
  return (current && !list.includes(current) ? [current, ...list] : list).map((value) => ({
    label: value,
    value
  }));
}
