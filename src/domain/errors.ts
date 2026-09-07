export class DomainError extends Error {
  constructor(public readonly code: string, message: string, public readonly path = '') {
    super(message);
    this.name = 'DomainError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof DomainError
    ? `${error.code}${error.path ? ` (${error.path})` : ''}: ${error.message}`
    : error instanceof Error ? error.message : 'Unexpected operation failure';
}

export interface ValidationIssue { code: string; path: string; message: string }
export function issue(code: string, message: string, path = ''): ValidationIssue {
  return { code, path, message };
}
