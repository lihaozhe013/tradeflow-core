import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import zh from '../../frontend/src/i18n/locales/zh/zh-CN.json';
import en from '../../frontend/src/i18n/locales/en/en-US.json';
import './style.css';
import connectIcon from './assets/connect.svg?no-inline';
import { version } from '../package.json';

type Language = 'zh' | 'en';
type Setting = Language | 'system';
type PromptKind = 'connect' | 'business' | 'update' | 'repair';
type Profile = {
  id: string;
  connectionId: string;
  client: string;
  ownerUsername: string;
  serverName: string;
  baseUrl: string;
  mode: string;
  tools: string[];
  expiresAt: string;
  pendingCleanup: string[];
  catalogVersion: string | null;
  guideVersion: string | null;
  lastSyncAt: string | null;
};
type Session = {
  baseUrl: string;
  user: { username: string; role: string; display_name: string };
  capabilities: {
    enabled: boolean;
    allowedTools: string[];
    catalogVersion?: string;
    guideVersion?: string;
  };
};
type Cleanup = {
  baseUrl: string;
  ownerUsername: string;
  client: string;
  connectionId: string;
  lastError: string | null;
};
type Event = {
  operationId: string;
  timestamp: string;
  action: string;
  stage: string;
  status: string;
  client: string | null;
  server: string | null;
  durationMs: number;
  errorCode: string | null;
  httpStatus: number | null;
};
type Crash = {
  timestamp: string;
  appVersion: string;
  operationId: string | null;
  stage: string | null;
  errorCode: string;
  sourceFile: string | null;
  sourceLine: number | null;
};
type Operation = {
  operationId: string;
  status: string;
  failedStage: string | null;
  errorCode: string | null;
  logAvailable: boolean;
  events: Event[];
};
type SyncResult = { added: string[]; removed: string[]; changed: boolean };
type Result = {
  operation?: Operation;
  errorCode?: string;
  serviceVerified?: boolean;
  hostActivationRequired?: boolean;
  reusedCredential?: boolean;
  localRemoved?: boolean;
  remoteRevoked?: boolean;
  remoteCleanupRequired?: boolean;
  profile?: Profile;
  added?: string[];
  removed?: string[];
  changed?: boolean;
  catalog?: { version?: string; guideVersion?: string };
};
const systemLanguage: Language = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const dateText = (value: string, language: Language) =>
  new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');

function App() {
  const [setting, setSetting] = useState<Setting>('system');
  const language = setting === 'system' ? systemLanguage : setting;
  const t = (language === 'zh' ? zh : en).desktopConnect;
  const [view, setView] = useState<'connections' | 'diagnostics'>('connections');
  const [server, setServer] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [loginOpen, setLoginOpen] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cleanup, setCleanup] = useState<Cleanup[]>([]);
  const [crashes, setCrashes] = useState<Crash[]>([]);
  const [logs, setLogs] = useState<Event[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [report, setReport] = useState<Result | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [logWarning, setLogWarning] = useState('');
  const [message, setMessage] = useState<keyof typeof t | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = useState('');
  const [promptSource, setPromptSource] = useState<{ id: string; kind: PromptKind } | null>(null);
  const [syncResult, setSyncResult] = useState<({ id: string } & SyncResult) | null>(null);
  const [recovery, setRecovery] = useState<Array<{ errorCode: string }>>([]);
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const accepting = useRef(false);
  const unlisten = useRef<(() => void) | null>(null);
  const stageText = (stage: string) => (t.stages as Record<string, string>)[stage] ?? t.busy;
  const errorText = (code: string) =>
    (t.localizedErrors as Record<string, string>)[code] ?? t.error;
  const roleText = (role: string) =>
    role === 'reader' ? t.roleReader : role === 'editor' ? t.roleEditor : t.roleSuperuser;
  const safeFailure = (failure: unknown): Result => {
    if (failure && typeof failure === 'object') {
      const value = failure as Result;
      return {
        errorCode:
          typeof value.errorCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(value.errorCode)
            ? value.errorCode
            : 'OPERATION_FAILED',
        operation: value.operation
      };
    }
    const code = String(failure).replace(/^Error: /, '');
    return { errorCode: /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'OPERATION_FAILED' };
  };
  async function refresh() {
    const issues =
      await invoke<Array<{ recovered?: boolean; errorCode: string }>>('recover_operations');
    setRecovery(issues.filter((item) => !item.recovered));
    const [nextProfiles, nextCleanup] = await Promise.all([
      invoke<Profile[]>('profiles'),
      invoke<Cleanup[]>('pending_revocations')
    ]);
    setProfiles(nextProfiles);
    setCleanup(nextCleanup);
    if (promptSource && !nextProfiles.some((profile) => profile.id === promptSource.id)) {
      setPromptSource(null);
      setPrompt('');
    }
  }
  useEffect(() => {
    let active = true;
    const listener = listen<Event>('connect-operation', ({ payload }) => {
      if (active && accepting.current) setEvents((current) => [...current, payload]);
    });
    listener
      .then((stop) => {
        if (active) unlisten.current = stop;
        else stop();
      })
      .catch(() => undefined);
    Promise.all([
      invoke<{ language: Setting }>('get_settings'),
      refresh(),
      invoke<Event[]>('operation_logs'),
      invoke<Crash[]>('crash_reports').catch(() => [] as Crash[])
    ])
      .then(([settings, , history, crashHistory]) => {
        if (active) {
          setSetting(settings.language);
          setLogs(history);
          setCrashes(Array.isArray(crashHistory) ? crashHistory : []);
        }
      })
      .catch((failure) => {
        if (active) setErrorCode(safeFailure(failure).errorCode!);
      });
    return () => {
      active = false;
      unlisten.current?.();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en-US';
  }, [language]);
  useEffect(() => {
    let active = true;
    if (promptSource)
      invoke<Record<string, string>>('connection_prompts', { profile: promptSource.id, language })
        .then((values) => {
          if (active) setPrompt(values[promptSource.kind]);
        })
        .catch(() => {
          if (active) {
            setPrompt('');
            setPromptSource(null);
          }
        });
    return () => {
      active = false;
    };
  }, [language, promptSource]);
  function begin() {
    accepting.current = true;
    setBusy(true);
    setEvents([]);
    setReport(null);
    setMessage(null);
    setErrorCode('');
    setLogWarning('');
    setSyncResult(null);
  }
  async function finish() {
    accepting.current = false;
    try {
      await refresh();
    } catch (failure) {
      setRecovery([{ errorCode: safeFailure(failure).errorCode! }]);
    }
    try {
      setLogs(await invoke<Event[]>('operation_logs'));
      const crashHistory = await invoke<Crash[]>('crash_reports').catch(() => [] as Crash[]);
      setCrashes(Array.isArray(crashHistory) ? crashHistory : []);
    } catch {
      setLogWarning('LOG_READ_FAILED');
    }
    setBusy(false);
  }
  async function run(
    work: () => Promise<Result>,
    success?: keyof typeof t
  ): Promise<Result | null> {
    begin();
    try {
      const result = await work();
      setReport(result);
      if (success) setMessage(success);
      return result;
    } catch (failure) {
      const result = safeFailure(failure);
      setReport(result);
      setErrorCode(result.errorCode!);
      return null;
    } finally {
      await finish();
    }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const result = await run(() =>
      invoke<Session & Result>('login', { server, username, password })
    );
    setPassword('');
    if (result) {
      const nextSession = result as Session & Result;
      setSession(nextSession);
      setServer(nextSession.baseUrl);
      setLoginOpen(false);
    }
  }
  async function createConnection(event: React.FormEvent) {
    event.preventDefault();
    if (!session) {
      setErrorCode('LOGIN_REQUIRED');
      return;
    }
    if (!name.trim()) {
      setErrorCode('INVALID_CONNECTION_NAME');
      return;
    }
    const result = await run(() =>
      invoke<Result>('connect_connection', { name, existing: null, mode: 'bridge' })
    );
    if (result?.profile) {
      setName('');
      setChecks((current) => ({
        ...current,
        [result.profile!.id]: result.serviceVerified === true
      }));
      await copyPrompt(result.profile.id, 'connect');
    }
  }
  async function diagnose(profile: Profile) {
    const result = await run(() => invoke<Result>('diagnose', { profile: profile.id }));
    if (result) {
      setChecks((current) => ({ ...current, [profile.id]: result.serviceVerified === true }));
    }
  }
  async function renew(profile: Profile) {
    const result = await run(() =>
      invoke<Result>('connect_connection', {
        name: profile.client,
        existing: profile.id,
        mode: 'bridge'
      })
    );
    if (result?.profile) {
      setChecks((current) => ({
        ...current,
        [result.profile!.id]: result.serviceVerified === true
      }));
    }
  }
  async function sync(profile: Profile) {
    if (!session || session.baseUrl !== profile.baseUrl) {
      setErrorCode('LOGIN_REQUIRED');
      return;
    }
    const result = await run(() =>
      invoke<Result & SyncResult>('sync_connection', { profile: profile.id })
    );
    if (result) {
      setSyncResult({
        id: profile.id,
        changed: result.changed === true,
        added: result.added ?? [],
        removed: result.removed ?? []
      });
      setMessage(result.changed === true ? 'syncChanged' : 'syncEmpty');
    }
  }
  async function remove(profile: Profile, mode: 'local' | 'revoke') {
    const result = await run(
      () => invoke<Result>('disconnect_connection', { profile: profile.id, mode }),
      mode === 'revoke' ? 'remoteRevoked' : 'localRemovedPending'
    );
    if (result) {
      dialog.current?.close();
      setRemoveTarget(null);
      if (promptSource?.id === profile.id) {
        setPromptSource(null);
        setPrompt('');
      }
    }
  }
  async function copyPrompt(id: string, kind: PromptKind) {
    setErrorCode('');
    try {
      const values = await invoke<Record<string, string>>('connection_prompts', {
        profile: id,
        language
      });
      await invoke('copy_prompt', { profile: id, kind, language });
      setPromptSource({ id, kind });
      setPrompt(values[kind]);
      setReport(null);
      setEvents([]);
      setMessage('copied');
    } catch (failure) {
      setErrorCode(safeFailure(failure).errorCode!);
    }
  }
  async function openCloud(baseUrl: string) {
    try {
      await invoke('open_credentials_page', { server: baseUrl });
    } catch (failure) {
      setErrorCode(safeFailure(failure).errorCode!);
    }
  }
  async function switchLanguage(value: Setting) {
    setSetting(value);
    try {
      await invoke('set_language', { language: value });
    } catch (failure) {
      setErrorCode(safeFailure(failure).errorCode!);
    }
  }
  const recentOperations = new Map<string, Event[]>();
  for (const event of logs)
    recentOperations.set(event.operationId, [
      ...(recentOperations.get(event.operationId) ?? []),
      event
    ]);
  const recent = [...recentOperations.entries()].slice(-20).reverse();
  const eventRows = (values: Event[]) =>
    values
      .filter((event) => event.status !== 'running')
      .map((event, index) => (
        <li
          key={`${event.operationId}-${index}`}
          className={event.status === 'failed' ? 'error' : ''}
        >
          <span>{stageText(event.stage)}</span>
          <small>{event.durationMs} ms</small>
          <span>{event.status === 'failed' ? errorText(event.errorCode ?? '') : t.stageDone}</span>
        </li>
      ));
  const resultView = (result: Result) => (
    <>
      {result.errorCode ? (
        <p className="error" role="alert">
          {result.operation?.failedStage && `${stageText(result.operation.failedStage)} · `}
          {errorText(result.errorCode)}
        </p>
      ) : result.serviceVerified ? (
        <p className="verified">{t.statusVerified}</p>
      ) : null}
      {result.remoteCleanupRequired && <p>{t.manualCleanupHint}</p>}
      {result.operation?.logAvailable === false && (
        <p className="error">{errorText('LOG_WRITE_FAILED')}</p>
      )}
      <details>
        <summary>{t.details}</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </>
  );
  const profileForPrompt = promptSource
    ? profiles.find((profile) => profile.id === promptSource.id)
    : undefined;
  const sameServer = (profile: Profile) => session?.baseUrl === profile.baseUrl;
  return (
    <main className="app-shell">
      <header className="app-header">
        <img className="mark" src={connectIcon} alt="" />
        <div className="brand">
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <label className="language-picker">
          <span>{t.language}</span>
          <select
            aria-label={t.language}
            value={setting}
            disabled={busy}
            onChange={(event) => void switchLanguage(event.target.value as Setting)}
          >
            <option value="system">{t.languageSystem}</option>
            <option value="zh">{t.languageChinese}</option>
            <option value="en">{t.languageEnglish}</option>
          </select>
        </label>
      </header>
      <nav className="view-tabs" aria-label={t.title}>
        <button
          disabled={busy}
          aria-current={view === 'connections' ? 'page' : undefined}
          className={view === 'connections' ? 'active' : ''}
          onClick={() => setView('connections')}
        >
          {t.home}
        </button>
        <button
          disabled={busy}
          aria-current={view === 'diagnostics' ? 'page' : undefined}
          className={view === 'diagnostics' ? 'active' : ''}
          onClick={() => setView('diagnostics')}
        >
          {t.diagnostics}
        </button>
      </nav>
      <div className="notice" role="note">
        {t.hostNotice}
      </div>
      {view === 'connections' ? (
        <>
          <section className="card account-card" aria-labelledby="account-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t.stepLogin}</p>
                <h2 id="account-heading">
                  {session ? session.user.display_name || session.user.username : t.login}
                </h2>
                {session && (
                  <p className="server-address">
                    {session.baseUrl} · {session.user.username} · {roleText(session.user.role)}
                  </p>
                )}
              </div>
              {session && (
                <div className="button-row">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setLoginOpen(true);
                      setReport(null);
                      setEvents([]);
                      setErrorCode('');
                      setMessage(null);
                    }}
                  >
                    {t.switchServer}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await invoke('logout');
                        setSession(null);
                        setLoginOpen(true);
                        return {} as Result;
                      }, 'logoutNote')
                    }
                  >
                    {t.logout}
                  </button>
                </div>
              )}
            </div>
            {(!session || loginOpen) && (
              <form noValidate className="form" onSubmit={(event) => void signIn(event)}>
                <label>
                  {t.server}
                  <input
                    required
                    type="url"
                    value={server}
                    onChange={(event) => setServer(event.target.value)}
                    placeholder="https://tradeflow.example.com"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    {t.username}
                    <input
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  </label>
                  <label>
                    {t.password}
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button className="primary" disabled={busy}>
                    {busy ? t.busy : t.login}
                  </button>
                  {session && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setLoginOpen(false);
                        setPassword('');
                        setServer(session.baseUrl);
                      }}
                    >
                      {t.cancel}
                    </button>
                  )}
                </div>
              </form>
            )}
            {session && !session.capabilities.enabled && <p className="error">{t.noMcp}</p>}
          </section>
          {session && !loginOpen && (
            <section className="card" aria-labelledby="create-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t.stepCreate}</p>
                  <h2 id="create-heading">{t.createTitle}</h2>
                  <p>{t.connectHint}</p>
                </div>
              </div>
              <form className="form create-form" onSubmit={(event) => void createConnection(event)}>
                <label className="grow">
                  {t.connectionName}
                  <input
                    required
                    maxLength={64}
                    value={name}
                    placeholder={t.connectionNamePlaceholder}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <small className="field-hint">{t.connectionNameHint}</small>
                </label>
                <button className="primary" disabled={busy || !session.capabilities.enabled}>
                  {t.connectSelected}
                </button>
              </form>
            </section>
          )}
          <section aria-labelledby="profiles-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t.stepApply}</p>
                <h2 id="profiles-heading">{t.profiles}</h2>
                <p>{t.scope}</p>
              </div>
            </div>
            {profiles.length === 0 ? (
              <div className="empty-state">
                <strong>{t.empty}</strong>
                <p>{t.connectHint}</p>
              </div>
            ) : (
              <div className="connection-grid">
                {profiles.map((profile) => (
                  <article className="card connection-card" key={profile.id}>
                    <div className="connection-heading">
                      <div>
                        <h3>{profile.client}</h3>
                        <span className="account-line">
                          {profile.ownerUsername} · {profile.baseUrl}
                        </span>
                      </div>
                      <span className="mode-badge">
                        {profile.mode === 'bridge' ? t.bridge : t.remote}
                      </span>
                    </div>
                    <dl className="meta-grid">
                      <div>
                        <dt>{t.expires}</dt>
                        <dd>{dateText(profile.expiresAt, language)}</dd>
                      </div>
                      <div>
                        <dt>{t.catalogVersion}</dt>
                        <dd>{profile.catalogVersion ?? t.neverSynced}</dd>
                      </div>
                      <div>
                        <dt>{t.guideVersion}</dt>
                        <dd>{profile.guideVersion ?? t.neverSynced}</dd>
                      </div>
                      <div>
                        <dt>{t.lastSync}</dt>
                        <dd>
                          {profile.lastSyncAt
                            ? dateText(profile.lastSyncAt, language)
                            : t.neverSynced}
                        </dd>
                      </div>
                    </dl>
                    <div className="status-row">
                      <span
                        className={`pill ${
                          Date.parse(profile.expiresAt) <= Date.now() ? 'warn' : 'neutral'
                        }`}
                      >
                        {Date.parse(profile.expiresAt) <= Date.now()
                          ? t.credentialExpired
                          : t.statusCredential}
                      </span>
                      <span className={`pill ${checks[profile.id] === true ? 'ok' : 'neutral'}`}>
                        {checks[profile.id] === true ? t.statusVerified : t.statusUnchecked}
                      </span>
                      <span className="pill neutral">{t.statusHostPending}</span>
                      {profile.pendingCleanup.length > 0 && (
                        <span className="pill warn">{t.cleanup}</span>
                      )}
                    </div>
                    <p className="mono-line">
                      {t.connectionId}: {profile.connectionId}
                    </p>
                    <div className="chips" aria-label={t.tools}>
                      {profile.tools.slice(0, 6).map((tool) => (
                        <code key={tool}>{tool}</code>
                      ))}
                      {profile.tools.length > 6 && <code>+{profile.tools.length - 6}</code>}
                    </div>
                    <div className="card-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void copyPrompt(profile.id, 'connect')}
                      >
                        {t.connectPrompt}
                      </button>
                      <button
                        disabled={busy || !sameServer(profile)}
                        title={sameServer(profile) ? t.syncHint : t.syncSignIn}
                        onClick={() => void sync(profile)}
                      >
                        {t.sync}
                      </button>
                      <button disabled={busy} onClick={() => void diagnose(profile)}>
                        {t.doctor}
                      </button>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => {
                          setRemoveTarget(profile);
                          dialog.current?.showModal();
                        }}
                      >
                        {t.disconnect}
                      </button>
                    </div>
                    <div className="sync-result" aria-live="polite">
                      {syncResult?.id === profile.id && (
                        <>
                          {syncResult.added.length > 0 && (
                            <p className="sync-line">
                              <strong>+</strong> {syncResult.added.join(', ')}
                            </p>
                          )}
                          {syncResult.removed.length > 0 && (
                            <p className="sync-line">
                              <strong>−</strong> {syncResult.removed.join(', ')}
                            </p>
                          )}
                          {!syncResult.changed && <p>{t.syncEmpty}</p>}
                        </>
                      )}
                    </div>
                    <details className="more-actions">
                      <summary>{t.moreActions}</summary>
                      <div className="button-row">
                        <button disabled={busy} onClick={() => void renew(profile)}>
                          {t.renew}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void copyPrompt(profile.id, 'update')}
                        >
                          {t.updatePrompt}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void copyPrompt(profile.id, 'repair')}
                        >
                          {t.repairPrompt}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void copyPrompt(profile.id, 'business')}
                        >
                          {t.business}
                        </button>
                        <button disabled={busy} onClick={() => void openCloud(profile.baseUrl)}>
                          {t.cloudCredentials}
                        </button>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="card" aria-labelledby="diagnostics-heading">
            <div className="section-heading">
              <div>
                <h2 id="diagnostics-heading">{t.diagnostics}</h2>
                <p>{t.logHint}</p>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = await invoke<{ exported: boolean }>('export_operation_logs');
                    if (value.exported) setMessage('exported');
                    return {} as Result;
                  })
                }
              >
                {t.exportLogs}
              </button>
            </div>
            {crashes.length > 0 && (
              <details>
                <summary>{t.crashNotice}</summary>
                <p>{t.crashAdvice}</p>
                <pre>{JSON.stringify(crashes, null, 2)}</pre>
              </details>
            )}
            {recovery.map((issue, index) => (
              <p key={index} className="error">
                {t.recoveryRequired} {errorText(issue.errorCode)}
              </p>
            ))}
            {recent.length === 0 ? (
              <p>{t.noLogs}</p>
            ) : (
              recent.map(([id, values]) => (
                <details key={id} className="operation-history">
                  <summary>
                    {new Date(values[0].timestamp).toLocaleString(
                      language === 'zh' ? 'zh-CN' : 'en-US'
                    )}{' '}
                    · {values[0].client ?? t.account} ·{' '}
                    {(t.actions as Record<string, string>)[values[0].action] ?? t.report} ·{' '}
                    {values.at(-1)?.status === 'failed'
                      ? t.failed
                      : values.at(-1)?.stage === 'complete'
                        ? t.stageDone
                        : t.interrupted}
                  </summary>
                  <ol className="event-list">{eventRows(values)}</ol>
                  <pre>{JSON.stringify(values, null, 2)}</pre>
                </details>
              ))
            )}
          </section>
          {profiles.length > 0 && (
            <section className="card">
              <h2>{t.advanced}</h2>
              <p>{t.advancedHint}</p>
              {profiles.map((profile) => (
                <article className="diagnostic-profile" key={profile.id}>
                  <h3>{profile.client}</h3>
                  <p className="server-address">
                    {profile.baseUrl} · {profile.ownerUsername}
                  </p>
                  <p className="mono-line">{profile.serverName}</p>
                  <div className="button-row">
                    <button disabled={busy} onClick={() => void copyPrompt(profile.id, 'repair')}>
                      {t.repairPrompt}
                    </button>
                    <button disabled={busy} onClick={() => void copyPrompt(profile.id, 'update')}>
                      {t.updatePrompt}
                    </button>
                    <button disabled={busy} onClick={() => void openCloud(profile.baseUrl)}>
                      {t.cloudCredentials}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {cleanup.length > 0 && (
            <section className="card">
              <h2>{t.pendingTitle}</h2>
              <p>{t.manualCleanupHint}</p>
              {cleanup.map((item) => (
                <article
                  className="diagnostic-profile"
                  key={`${item.baseUrl}-${item.connectionId}`}
                >
                  <h3>{item.client}</h3>
                  <p className="server-address">
                    {item.baseUrl} · {item.ownerUsername}
                  </p>
                  <p className="mono-line">
                    {t.connectionId}: {item.connectionId}
                  </p>
                  <div className="button-row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const value = await invoke<{ revoked: number; remaining: number }>(
                            'retry_pending_revocations'
                          );
                          setMessage(value.remaining > 0 ? 'cleanup' : 'remoteRevoked');
                          return {} as Result;
                        })
                      }
                    >
                      {t.retryPending}
                    </button>
                    <button disabled={busy} onClick={() => void openCloud(item.baseUrl)}>
                      {t.cloudCredentials}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {prompt && (
        <section className="card prompt-panel" aria-labelledby="prompt-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{profileForPrompt?.client ?? t.showPrompt}</p>
              <h2 id="prompt-heading">{t.showPrompt}</h2>
              <p>{t.promptPreviewHint}</p>
            </div>
            <div className="button-row">
              {(['connect', 'update', 'business', 'repair'] as PromptKind[]).map((kind) => (
                <button
                  key={kind}
                  className={promptSource?.kind === kind ? 'active' : ''}
                  aria-pressed={promptSource?.kind === kind}
                  disabled={busy || !profileForPrompt}
                  onClick={() => void copyPrompt(promptSource!.id, kind)}
                >
                  {(t.promptTabs as Record<string, string>)[kind]}
                </button>
              ))}
            </div>
          </div>
          <pre className="prompt-text">{prompt}</pre>
        </section>
      )}
      <div className="operation-status" aria-live="polite">
        {(busy || events.length > 0 || report || message || errorCode) && (
          <section className="card">
            <h2>{busy ? t.busy : t.lastOperation}</h2>
            {message && <p className="success">{String(t[message] ?? '')}</p>}
            {errorCode && !report?.errorCode && (
              <p className="error" role="alert">
                {errorText(errorCode)}
              </p>
            )}
            {busy && events.at(-1) && <p>{stageText(events.at(-1)!.stage)}</p>}
            {events.length > 0 && (
              <details open={busy}>
                <summary>{t.progress}</summary>
                <ol className="event-list">{eventRows(events)}</ol>
              </details>
            )}
            {report && resultView(report)}
          </section>
        )}
      </div>
      {logWarning && (
        <p className="error" role="alert">
          {errorText(logWarning)}
        </p>
      )}
      <footer>
        {t.testBuild} · {version}
      </footer>
      <dialog
        ref={dialog}
        className="disconnect-dialog"
        aria-labelledby="remove-heading"
        onClose={() => setRemoveTarget(null)}
      >
        <h2 id="remove-heading">{t.disconnectTitle}</h2>
        {removeTarget && (
          <p className="server-address">
            {removeTarget.client} · {removeTarget.baseUrl}
          </p>
        )}
        <p>{t.removeHint}</p>
        <div className="stacked-actions">
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => removeTarget && void remove(removeTarget, 'revoke')}
          >
            {t.disconnectRevoke}
          </button>
          <small>{t.disconnectRevokeHint}</small>
          <button
            disabled={busy}
            onClick={() => removeTarget && void remove(removeTarget, 'local')}
          >
            {t.disconnectLocal}
          </button>
          <small>{t.disconnectLocalHint}</small>
        </div>
        <div className="button-row end">
          <button disabled={busy} onClick={() => dialog.current?.close()}>
            {t.cancel}
          </button>
        </div>
      </dialog>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
