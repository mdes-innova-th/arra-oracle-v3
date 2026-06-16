export type ErrorResponse = {
  success: false;
  error: string;
  code?: number;
  details?: unknown;
};

export type ErrorResponseInput = Record<string, unknown> & { error: string; success?: unknown; code?: unknown };

export function errorResponse<const T extends string, const C extends number | undefined = undefined>(
  error: T,
  code?: C,
  details?: unknown,
): ErrorResponse & { error: T } & (C extends number ? { code: C } : { code?: undefined }) {
  return {
    success: false,
    error,
    ...(code === undefined ? {} : { code }),
    ...(details === undefined ? {} : { details }),
  } as unknown as ErrorResponse & { error: T } & (C extends number ? { code: C } : { code?: undefined });
}

export function isErrorResponseInput(value: unknown): value is ErrorResponseInput {
  return Boolean(value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string');
}

export function normalizeErrorResponse(value: unknown, status?: number): unknown {
  if (!isErrorResponseInput(value)) return value;
  if (value.success === true) return value;
  const code = typeof value.code === 'number' ? value.code : status && status >= 400 ? status : undefined;
  return { success: false, ...value, ...(code === undefined ? {} : { code }) };
}
