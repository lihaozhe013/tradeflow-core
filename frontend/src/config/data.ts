import type { AppConfigData } from '@/config/types';
import rawConfig from '@/build-config/frontendConfig.json';
export const appConfigData = rawConfig as unknown as AppConfigData;
