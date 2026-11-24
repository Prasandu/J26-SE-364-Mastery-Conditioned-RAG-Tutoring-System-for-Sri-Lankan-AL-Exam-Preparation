import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

/** Keeps i18next and <html lang> in step with the session locale. Changing language never touches session state. */
export function LocaleSync() {
  const locale = useSession((s) => s.locale);
  const { i18n } = useTranslation();
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  }, [locale, i18n]);
  return null;
}
