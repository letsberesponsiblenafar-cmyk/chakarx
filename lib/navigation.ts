/** Keep sign-in return paths internal and avoid returning to auth/API endpoints. */
export function loginDestination(value?: string | string[]): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://chakar.invalid');
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== 'https://chakar.invalid' || path.startsWith('//') || /[\\\u0000-\u001f]/.test(path)
      || /^\/(?:login|api|_next)(?:\/|$)/.test(path)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
