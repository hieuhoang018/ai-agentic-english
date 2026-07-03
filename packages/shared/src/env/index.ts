export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

export function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got "${value}"`);
  }
  return parsed;
}

export function assertProductionSecret(secret: string, label: string): void {
  const deployEnv = getEnv('DEPLOY_ENV', 'development');
  if (deployEnv === 'production' && (!secret.trim() || secret === 'dev-internal-secret')) {
    throw new Error(
      `${label} is unset or still the insecure dev default while DEPLOY_ENV=production. ` +
        'Set a real secret before running in production.',
    );
  }
}
