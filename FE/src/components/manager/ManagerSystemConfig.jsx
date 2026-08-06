import AdminSystemConfig from '@/components/admin/AdminSystemConfig';
import { useTranslation } from 'react-i18next';

export default function ManagerSystemConfig() {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full">
      <div className="p-4 bg-blue-50/50 border-b border-blue-100 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold">i</div>
        <p className="text-sm text-blue-800">
          <strong>{t('manager.systemConfig.viewModeLabel')}</strong> {t('manager.systemConfig.readOnlyNotice')}
        </p>
      </div>
      <div className="h-[calc(100%-65px)]">
        <AdminSystemConfig readOnly={true} />
      </div>
    </div>
  );
}
