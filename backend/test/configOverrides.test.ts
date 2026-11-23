import { describe, expect, it } from 'vitest';
import { applyDatabaseEnvironmentOverrides } from '@/utils/configOverrides';

describe('applyDatabaseEnvironmentOverrides', () => {
  it('keeps the original config when no override is set', () => {
    const config = { database: { host: 'db.local', port: 5432 } };

    expect(applyDatabaseEnvironmentOverrides(config, {})).toBe(config);
  });

  it('overrides configured database fields', () => {
    const result = applyDatabaseEnvironmentOverrides(
      {
        database: {
          host: 'db.local',
          port: 5432,
          user: 'configured',
          password: 'configured',
          dbName: 'configured'
        }
      },
      {
        TRADEFLOW_DB_HOST: '127.0.0.1',
        TRADEFLOW_DB_PORT: '6432',
        TRADEFLOW_DB_USER: 'local',
        TRADEFLOW_DB_PASSWORD: '',
        TRADEFLOW_DB_NAME: 'tradeflow_local'
      }
    );

    expect(result.database).toEqual({
      host: '127.0.0.1',
      port: 6432,
      user: 'local',
      password: '',
      dbName: 'tradeflow_local'
    });
  });

  it('creates database settings when the config has none', () => {
    expect(applyDatabaseEnvironmentOverrides({}, { TRADEFLOW_DB_NAME: 'fresh' })).toEqual({
      database: { dbName: 'fresh' }
    });
  });

  it('rejects an invalid port', () => {
    expect(() =>
      applyDatabaseEnvironmentOverrides({}, { TRADEFLOW_DB_PORT: 'not-a-port' })
    ).toThrow('TRADEFLOW_DB_PORT');
  });
});
