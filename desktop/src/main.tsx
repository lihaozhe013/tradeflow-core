import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import zh from '../../frontend/src/i18n/locales/zh/zh-CN.json';
import en from '../../frontend/src/i18n/locales/en/en-US.json';
import './style.css';
import connectIcon from './assets/connect.svg';
const t = (navigator.language.startsWith('zh') ? zh : en).desktopConnect;
type Profile = {
  id: string;
  client: string;
  ownerUsername: string;
  serverName: string;
  baseUrl: string;
  tools: string[];
  expiresAt: string;
  configPath: string;
  mode: string;
  pendingCleanup: string[];
};
type Agent = { client: string; installed: boolean; supported: boolean; version: string | null };
type Login = {
  user: { username: string; role: string; display_name: string };
  capabilities: { enabled: boolean; allowedTools: string[] };
};
function App() {
  const [server, setServer] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Login | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<unknown>(null);
  const [prompt, setPrompt] = useState('');
  const refresh = async () => {
    setProfiles(await invoke<Profile[]>('profiles'));
    setAgents(await invoke<Agent[]>('detect_clients'));
  };
  useEffect(() => {
    refresh().catch((e) => setMessage(String(e)));
  }, []);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const result = await work();
      if (result) setReport(result);
      await refresh();
    } catch (e) {
      setMessage(`${t.error}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function copy(id: string, kind: 'business' | 'repair') {
    const value = await invoke<Record<string, string>>('connection_prompts', { profile: id });
    setPrompt(value[kind]);
    await invoke('copy_prompt', { profile: id, kind });
    setMessage(t.copied);
  }
  return (
    <main>
      <header>
        <img className="mark" src={connectIcon} alt="" width="64" height="64" />
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <span className="badge">0.1 · TEST</span>
      </header>
      <section>
        {session ? (
          <>
            <div className="row">
              <h2>
                {t.account}: {session.user.display_name} <small>{session.user.role}</small>
              </h2>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await invoke('logout');
                    setSession(null);
                  })
                }
              >
                {t.logout}
              </button>
            </div>
            <p>{t.scope}</p>
            <div className="chips">
              {session.capabilities.allowedTools.map((v) => (
                <code key={v}>{v}</code>
              ))}
            </div>
            {!session.capabilities.enabled && <p className="error">{t.noMcp}</p>}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                try {
                  const result = await invoke<Login>('login', { server, username, password });
                  setSession(result);
                  return result.capabilities;
                } finally {
                  setPassword('');
                }
              });
            }}
          >
            <label>
              {t.server}
              <input
                required
                type="url"
                value={server}
                onChange={(e) => setServer(e.target.value)}
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
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label>
                {t.password}
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </div>
            <button className="primary" disabled={busy}>
              {busy ? t.busy : t.login}
            </button>
          </form>
        )}
      </section>
      <section>
        <h2>{t.agents}</h2>
        <div className="grid">
          {agents.map((agent) => (
            <article key={agent.client}>
              <h3>{agent.client === 'opencode' ? 'OpenCode' : 'WorkBuddy'}</h3>
              <p>
                {agent.version ||
                  `${t.version}: ${agent.client === 'opencode' ? '2.0.21' : '5.6.0'}`}
              </p>
              {agent.client === 'workbuddy' && <small>{t.workbuddyVersion}</small>}
              <button
                className="primary"
                disabled={
                  busy || !session?.capabilities.enabled || !agent.installed || !agent.supported
                }
                onClick={() =>
                  action(() =>
                    invoke('connect_agent', {
                      client: agent.client,
                      existing: null,
                      mode: 'remote'
                    })
                  )
                }
              >
                {agent.installed ? t.connect : t.notInstalled}
              </button>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2>{t.profiles}</h2>
        {profiles.length === 0 && <p>{t.empty}</p>}
        {profiles.map((profile) => (
          <article key={profile.id}>
            <div className="row">
              <h3>
                {profile.client} <small>{profile.serverName}</small>
              </h3>
              <span className="badge">{profile.mode}</span>
            </div>
            <p>
              {profile.ownerUsername} · {profile.baseUrl} · {t.expiry}:{' '}
              {new Date(profile.expiresAt).toLocaleDateString()}
            </p>
            <div className="chips">
              {profile.tools.map((v) => (
                <code key={v}>{v}</code>
              ))}
            </div>
            {profile.pendingCleanup.length > 0 && <p className="error">{t.cleanup}</p>}
            <div className="buttons">
              <button
                disabled={busy}
                onClick={() =>
                  action(() => invoke('diagnose', { profile: profile.id, client: profile.client }))
                }
              >
                {t.doctor}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(() =>
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
                  action(() =>
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
              <button
                disabled={busy || !session || session.user.username !== profile.ownerUsername}
                onClick={() =>
                  action(() =>
                    invoke('connect_agent', {
                      client: profile.client,
                      existing: profile.id,
                      mode: profile.mode
                    })
                  )
                }
              >
                {t.renew}
              </button>
              <button
                disabled={busy || !session || session.user.username !== profile.ownerUsername}
                onClick={() => action(() => invoke('disconnect_agent', { profile: profile.id }))}
              >
                {t.disconnect}
              </button>
              <button disabled={busy} onClick={() => action(() => copy(profile.id, 'business'))}>
                {t.business}
              </button>
              <button disabled={busy} onClick={() => action(() => copy(profile.id, 'repair'))}>
                {t.repairPrompt}
              </button>
            </div>
          </article>
        ))}
        <p className="hint">{t.pendingHost}</p>
      </section>
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
      {report != null && (
        <section>
          <h2>{t.report}</h2>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </section>
      )}
      {prompt && (
        <section>
          <h2>{t.showPrompt}</h2>
          <textarea readOnly value={prompt} />
        </section>
      )}
      <footer>{t.testBuild}</footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
