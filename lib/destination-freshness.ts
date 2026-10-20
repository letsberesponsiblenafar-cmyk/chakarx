/** Refresh read-only library views on return without interrupting an editor. */
export function observeDestinationFreshness(
  browser: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>,
  page: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>,
  refresh: () => void,
) {
  const onReturn = () => {
    if (page.visibilityState === 'visible' && browser.location.pathname === '/library') refresh();
  };
  browser.addEventListener('focus', onReturn);
  browser.addEventListener('online', onReturn);
  page.addEventListener('visibilitychange', onReturn);
  return () => {
    browser.removeEventListener('focus', onReturn);
    browser.removeEventListener('online', onReturn);
    page.removeEventListener('visibilitychange', onReturn);
  };
}
