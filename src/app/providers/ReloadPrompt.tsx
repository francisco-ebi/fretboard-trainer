import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import './ReloadPrompt.css';

function ReloadPrompt() {
  const buildDate = "__DATE__";
  const { t } = useTranslation();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl: string, _r: ServiceWorkerRegistration | undefined) {
      console.log(`Service Worker at: ${swUrl}`);
    },
    onRegisterError(error: Error | any) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="ReloadPrompt-container">
      {(offlineReady || needRefresh)
        && (
          <div className="ReloadPrompt-toast">
            <div className="ReloadPrompt-toast-message">
              {offlineReady
                ? <span>{t('reloadPrompt.offlineReady')}</span>
                : <span>{t('reloadPrompt.newContentAvailable')}</span>}
            </div>
            {needRefresh && <button className="ReloadPrompt-toast-button" onClick={() => updateServiceWorker()}>{t("reloadPrompt.reload")}</button>}
            <button className="ReloadPrompt-toast-button" onClick={() => close()}>{t("reloadPrompt.close")}</button>
          </div>
        )}
      <div className="ReloadPrompt-date">{buildDate}</div>
    </div>
  );
}

export default ReloadPrompt;
