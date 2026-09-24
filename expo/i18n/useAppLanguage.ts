import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import { AppLanguage, currentLanguage, setAppLanguage } from './index';

/**
 * Idioma activo y como cambiarlo. Con sesion abierta tambien lo guarda en el
 * perfil (users/{uid}.language) para que avisos y correos salgan en ese idioma.
 */
export function useAppLanguage() {
  const { i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const language: AppLanguage = i18n.resolvedLanguage === 'es' ? 'es' : currentLanguage();

  const setLanguage = useCallback(
    async (next: AppLanguage) => {
      if (next === currentLanguage()) return;
      await setAppLanguage(next);
      if (user && user.language !== next) {
        updateUser({ language: next }).catch((e) => logger.warn('[i18n] Could not save language to profile', { error: e?.message }));
      }
    },
    [user, updateUser]
  );

  return { language, setLanguage };
}
