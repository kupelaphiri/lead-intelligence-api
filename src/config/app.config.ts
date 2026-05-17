export function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

export function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME ?? 'li_auth';
}

export function shouldEnableSwagger(): boolean {
  if (process.env.ENABLE_SWAGGER === 'true') {
    return true;
  }

  return !isProductionEnv();
}

export function shouldUseSecureCookies(): boolean {
  if (process.env.COOKIE_SECURE) {
    return process.env.COOKIE_SECURE === 'true';
  }

  return isProductionEnv();
}

export function getAllowedCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function assertProductionEnv(): void {
  if (!isProductionEnv()) {
    return;
  }

  const missing = [
    !process.env.JWT_SECRET ? 'JWT_SECRET' : null,
    !process.env.DATABASE_URL ? 'DATABASE_URL' : null,
    !process.env.REDIS_HOST ? 'REDIS_HOST' : null,
    getAllowedCorsOrigins().length === 0 ? 'CORS_ORIGIN' : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`,
    );
  }

  if (process.env.JWT_SECRET === 'dev-jwt-secret') {
    throw new Error(
      'JWT_SECRET must not use the development default in production',
    );
  }

  if (
    (process.env.COOKIE_SAMESITE ?? 'lax') === 'none' &&
    !shouldUseSecureCookies()
  ) {
    throw new Error('COOKIE_SAMESITE=none requires secure cookies');
  }
}
