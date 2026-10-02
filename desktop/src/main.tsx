import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import zh from '../../frontend/src/i18n/locales/zh/zh-CN.json';
import en from '../../frontend/src/i18n/locales/en/en-US.json';
import './style.css';
import connectIcon from './assets/connect.svg';

type Client = 'opencode' | 'workbuddy';
type Language = 'zh' | 'en';
type Setting = Language | 'system';
type Profile = {
  id: string;
  connectionId: string;
  client: Client;
  ownerUsername: string;
  baseUrl: string;
  serverName: string;
  configPath: string;
  mode: string;
  tools: string[];
  configurationWritten: boolean;
  expiresAt: string;
};
type Agent = { client: Client; installed: boolean; supported: boolean; version: string | null };
type Session = {
  baseUrl: string;
  user: { username: string; role: string; display_name: string };
  capabilities: { enabled: boolean; allowedTools: string[] };
};
type Cleanup = {
  baseUrl: string;
  ownerUsername: string;
  client: Client;
  connectionId: string;
  lastError: string | null;
};
type Event = {
  operationId: string;
  timestamp: string;
  action: string;
  stage: string;
  status: string;
  client: Client | null;
  server: string | null;
  durationMs: number;
  errorCode: string | null;
  httpStatus: number | null;
};
type Operation = {
  operationId: string;
  status: string;
  failedStage: string | null;
  errorCode: string | null;
  logAvailable: boolean;
  events: Event[];
};
type Result = {
  operation?: Operation;
  errorCode?: string;
  configurationWritten?: boolean;
  serviceVerified?: boolean;
  localRemoved?: boolean;
  remoteCleanupRequired?: boolean;
  localCleanupErrorCode?: string | null;
  profile?: Profile;
};
type Outcome = { client: Client; ok: boolean; result: Result };
const systemLanguage: Language = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const clientName = (client: Client) => (client === 'opencode' ? 'OpenCode' : 'WorkBuddy');

function App() {
  const [setting, setSetting] = useState<Setting>('system');
  const language = setting === 'system' ? systemLanguage : setting;
  const t = (language === 'zh' ? zh : en).desktopConnect;
  const [view, setView] = useState<'home' | 'diagnostics'>('home');
  const [server, setServer] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [loginOpen, setLoginOpen] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Client[]>([]);
  const [cleanup, setCleanup] = useState<Cleanup[]>([]);
  const [logs, setLogs] = useState<Event[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [report, setReport] = useState<Result | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [logWarning, setLogWarning] = useState('');
  const [message, setMessage] = useState<keyof typeof t | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = useState('');
  const [promptSource, setPromptSource] = useState<{
    id: string;
    kind: 'business' | 'repair';
  } | null>(null);
  const [recovery, setRecovery] = useState<Array<{ errorCode: string }>>([]);
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const accepting = useRef(false);
  const unlisten = useRef<(() => void) | null>(null);
  const stageText = (stage: string) => (t.stages as Record<string, string>)[stage] ?? t.busy;
  const errorText = (code: string) => {
    const alias: Record<string, string> = {
      INVALID_CONFIG_JSON: 'CONFIG_DAMAGED',
      CONFIG_READ_FAILED: 'CONFIG_DAMAGED',
      CONFIG_ROOT_MUST_BE_OBJECT: 'CONFIG_DAMAGED',
      INVALID_MCP_OBJECT: 'CONFIG_DAMAGED',
      INVALID_SERVERS_OBJECT: 'CONFIG_DAMAGED'
    };
    return (t.localizedErrors as Record<string, string>)[alias[code] ?? code] ?? t.error;
  };
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
      await invoke<Array<{ recovered?: boolean; errorCode: string }>>('recover_switches');
    setRecovery(issues.filter((item) => !item.recovered));
    const [nextProfiles, nextAgents, nextCleanup] = await Promise.all([
      invoke<Profile[]>('profiles'),
      invoke<Agent[]>('detect_clients'),
      invoke<Cleanup[]>('pending_revocations')
    ]);
    setProfiles(nextProfiles);
    setAgents(nextAgents);
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
      invoke<Event[]>('operation_logs')
    ])
      .then(([settings, , history]) => {
        if (active) {
          setSetting(settings.language);
          setLogs(history);
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
    setOutcomes([]);
    setMessage(null);
    setErrorCode('');
    setLogWarning('');
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
      invoke<Session & Result>('login', { server, username, password, preservePrevious: false })
    );
    setPassword('');
    if (result) {
      const nextSession = result as Session & Result;
      setSession(nextSession);
      setServer(nextSession.baseUrl);
      setLoginOpen(false);
      setSelected(
        agents.filter((agent) => agent.installed && agent.supported).map((agent) => agent.client)
      );
    }
  }
  async function connect() {
    if (!session || !selected.length) {
      setMessage('selectAtLeastOne');
      return;
    }
    begin();
    const results: Outcome[] = [];
    for (const client of selected) {
      const existing = profiles.find(
        (p) =>
          p.client === client &&
          p.baseUrl === session.baseUrl &&
          p.ownerUsername === session.user.username
      );
      try {
        const result = await invoke<Result>('connect_agent', {
          client,
          existing: existing?.id ?? null,
          mode: existing?.mode ?? 'remote'
        });
        results.push({ client, ok: true, result });
        if (result.profile)
          setChecks((current) => ({
            ...current,
            [result.profile!.id]: result.serviceVerified === true
          }));
      } catch (failure) {
        results.push({ client, ok: false, result: safeFailure(failure) });
      }
      setOutcomes([...results]);
    }
    await finish();
  }
  async function remove(profile: Profile) {
    const result = await run(
      () => invoke<Result>('disconnect_agent', { profile: profile.id, mode: 'local' }),
      'removedReload'
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
  async function copy(profile: Profile, kind: 'business' | 'repair') {
    setReport(null);
    setOutcomes([]);
    setErrorCode('');
    setEvents([]);
    try {
      const values = await invoke<Record<string, string>>('connection_prompts', {
        profile: profile.id,
        language
      });
      await invoke('copy_prompt', { profile: profile.id, kind, language });
      setPromptSource({ id: profile.id, kind });
      setPrompt(values[kind]);
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
        <p className="verified">{t.verifiedReload}</p>
      ) : result.localRemoved ? (
        <p>{t.removedReload}</p>
      ) : null}
      {result.remoteCleanupRequired && <p>{t.manualCleanupHint}</p>}
      {result.localCleanupErrorCode && (
        <p className="error">
          {t.recoveryRequired} {errorText(result.localCleanupErrorCode)}
        </p>
      )}
      {result.operation?.logAvailable === false && (
        <p className="error">{errorText('LOG_WRITE_FAILED')}</p>
      )}
      <details>
        <summary>{t.details}</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </>
  );
  return (
    <main>
      <header className="app-header">
        <img className="mark" src={connectIcon} alt="" />
        <div className="brand">
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <label className="language-picker">
          {t.language}
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
      <nav className="view-tabs">
        <button
          disabled={busy}
          className={view === 'home' ? 'primary' : ''}
          onClick={() => setView('home')}
        >
          {t.home}
        </button>
        <button
          disabled={busy}
          className={view === 'diagnostics' ? 'primary' : ''}
          onClick={() => setView('diagnostics')}
        >
          {t.diagnostics}
        </button>
      </nav>
      {view === 'home' ? (
        <>
          <section>
            <div className="section-heading">
              <div>
                <h2>{t.stepLogin}</h2>
                {session && (
                  <p className="server-address">
                    {session.baseUrl} · {session.user.display_name} ·{' '}
                    {session.user.role === 'reader'
                      ? t.roleReader
                      : session.user.role === 'editor'
                        ? t.roleEditor
                        : t.roleSuperuser}
                  </p>
                )}
              </div>
              {session && (
                <div className="buttons">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setLoginOpen(true);
                      setReport(null);
                      setEvents([]);
                      setOutcomes([]);
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
                        return {};
                      }, 'logoutNote')
                    }
                  >
                    {t.logout}
                  </button>
                </div>
              )}
            </div>
            {loginOpen && (
              <form noValidate onSubmit={(event) => void signIn(event)}>
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
                <div className="grid">
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
                      autoComplete="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                </div>
                <div className="buttons">
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
          </section>
          {session && !loginOpen && (
            <section>
              <div className="section-heading">
                <div>
                  <h2>{t.stepSelect}</h2>
                  <p>{t.scope}</p>
                </div>
              </div>
              {!session.capabilities.enabled && <p className="error">{t.noMcp}</p>}
              <div className="agent-grid">
                {agents.map((agent) => (
                  <article key={agent.client}>
                    <label className="agent-select">
                      <input
                        type="checkbox"
                        checked={selected.includes(agent.client)}
                        disabled={busy || !agent.installed || !agent.supported}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, agent.client]
                              : current.filter((client) => client !== agent.client)
                          )
                        }
                      />
                      <span>
                        <strong>{clientName(agent.client)}</strong>
                        <small>
                          {agent.version ?? (agent.installed ? t.workbuddyVersion : t.notInstalled)}
                        </small>
                      </span>
                    </label>
                    {profiles.filter((p) => p.client === agent.client).length > 0 && (
                      <div className="replacement-note">
                        <strong>{t.replaceLocal}</strong>
                        {profiles
                          .filter((p) => p.client === agent.client)
                          .map((p) => (
                            <p key={p.id} className="server-address">
                              {p.baseUrl} · {p.ownerUsername}
                            </p>
                          ))}
                        <p>{t.switchSubtitle}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <button
                className="primary connect-button"
                disabled={busy || !session.capabilities.enabled || !selected.length}
                onClick={() => void connect()}
              >
                {t.connectSelected}
              </button>
            </section>
          )}
          <section>
            <div className="section-heading">
              <h2>{t.profiles}</h2>
            </div>
            {profiles.length === 0 ? (
              <p>{t.empty}</p>
            ) : (
              <div className="connection-grid">
                {profiles.map((profile) => (
                  <article key={profile.id}>
                    <h3>{clientName(profile.client)}</h3>
                    <p className="server-address">{profile.baseUrl}</p>
                    <p>{profile.ownerUsername}</p>
                    <p>
                      {profile.configurationWritten ? t.statusConfigured : t.statusMissingConfig}
                    </p>
                    {checks[profile.id] === true && <p className="verified">{t.verifiedReload}</p>}
                    <div className="card-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            invoke<Result>('diagnose', {
                              profile: profile.id,
                              client: profile.client
                            })
                          ).then((result) =>
                            setChecks((current) => ({
                              ...current,
                              [profile.id]: result?.serviceVerified === true
                            }))
                          )
                        }
                      >
                        {t.doctor}
                      </button>
                      <button disabled={busy} onClick={() => void copy(profile, 'business')}>
                        {t.business}
                      </button>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => {
                          setRemoveTarget(profile);
                          dialog.current?.showModal();
                        }}
                      >
                        {t.removeLocal}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section>
            <div className="section-heading">
              <div>
                <h2>{t.diagnostics}</h2>
                <p>{t.logHint}</p>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = await invoke<{ exported: boolean }>('export_operation_logs');
                    if (value.exported) setMessage('exported');
                    return {};
                  })
                }
              >
                {t.exportLogs}
              </button>
            </div>
            {recovery.map((issue, i) => (
              <p key={i} className="error">
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
                    · {values[0].client ? clientName(values[0].client) : t.account} ·{' '}
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
            <section>
              <h2>{t.advanced}</h2>
              <p>{t.advancedHint}</p>
              {profiles.map((profile) => (
                <article className="diagnostic-profile" key={profile.id}>
                  <h3>{clientName(profile.client)}</h3>
                  <p className="server-address">
                    {profile.baseUrl} · {profile.ownerUsername}
                  </p>
                  <p className="server-address">{profile.configPath}</p>
                  <div className="buttons">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          invoke('repair_agent', {
                            profile: profile.id,
                            client: profile.client,
                            mode: 'auto'
                          })
                        )
                      }
                    >
                      {t.repair}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          invoke('repair_agent', {
                            profile: profile.id,
                            client: profile.client,
                            mode: 'bridge'
                          })
                        )
                      }
                    >
                      {t.bridge}
                    </button>
                    <button disabled={busy} onClick={() => void copy(profile, 'repair')}>
                      {t.repairPrompt}
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
            <section>
              <h2>{t.cleanupRecords}</h2>
              <p>{t.manualCleanupHint}</p>
              {cleanup.map((item) => (
                <article
                  className="diagnostic-profile"
                  key={`${item.baseUrl}-${item.connectionId}`}
                >
                  <h3>{clientName(item.client)}</h3>
                  <p className="server-address">
                    {item.baseUrl} · {item.ownerUsername}
                  </p>
                  <p className="server-address">
                    {t.connectionId}: {item.connectionId}
                  </p>
                  <button disabled={busy} onClick={() => void openCloud(item.baseUrl)}>
                    {t.cloudCredentials}
                  </button>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {logWarning && (
        <p className="error" role="alert">
          {errorText(logWarning)}
        </p>
      )}
      {(busy || events.length > 0 || report || outcomes.length > 0 || message || errorCode) && (
        <section aria-live="polite">
          <h2>{busy ? t.busy : t.lastOperation}</h2>
          {message && <p>{String(t[message])}</p>}
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
          {outcomes.map((item) => (
            <article className="diagnostic-profile" key={item.client}>
              <h3>
                {clientName(item.client)} · {item.ok ? t.stageDone : t.failed}
              </h3>
              {resultView(item.result)}
            </article>
          ))}
        </section>
      )}
      {prompt && (
        <section>
          <h2>{t.showPrompt}</h2>
          <pre>{prompt}</pre>
        </section>
      )}
      <footer>{t.testBuild}</footer>
      <dialog ref={dialog} className="disconnect-dialog" onClose={() => setRemoveTarget(null)}>
        <h2>{t.removeLocal}</h2>
        {removeTarget && (
          <p className="server-address">
            {clientName(removeTarget.client)} · {removeTarget.baseUrl}
          </p>
        )}
        <p>{t.removeHint}</p>
        <div className="buttons">
          <button autoFocus disabled={busy} onClick={() => dialog.current?.close()}>
            {t.cancel}
          </button>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => removeTarget && void remove(removeTarget)}
          >
            {t.confirmDisconnect}
          </button>
        </div>
      </dialog>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
