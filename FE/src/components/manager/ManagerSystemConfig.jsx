import { useState } from 'react';
import { Gear, Calendar } from '@phosphor-icons/react';
import AdminSystemConfig from '@/components/admin/AdminSystemConfig';
import ManagerScheduleConfig from './ManagerScheduleConfig';

export default function ManagerSystemConfig({ user }) {
  const [activeTab, setActiveTab] = useState('schedule');

  return (
    <div className="h-full w-full flex flex-col bg-slate-50">
      {/* Header Tabs */}
      <div className="border-b border-slate-200 bg-white px-8 py-3 shadow-sm flex items-center gap-6">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 border-b-2 pb-3 px-1 text-sm font-semibold transition-colors ${
            activeTab === 'schedule' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Calendar size={18} weight={activeTab === 'schedule' ? 'fill' : 'regular'} />
          Lịch Làm Việc Chi Nhánh
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`flex items-center gap-2 border-b-2 pb-3 px-1 text-sm font-semibold transition-colors ${
            activeTab === 'global' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Gear size={18} weight={activeTab === 'global' ? 'fill' : 'regular'} />
          Quy Tắc Hệ Thống Chung
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'schedule' && (
          <ManagerScheduleConfig branchId={user?.branchId} />
        )}

        {activeTab === 'global' && (
          <div className="h-full flex flex-col">
            <div className="p-4 bg-blue-50/50 border-b border-blue-100 flex items-center gap-3 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold">i</div>
              <p className="text-sm text-blue-800">
                <strong>Chế độ xem:</strong> Bạn đang xem cấu hình hệ thống (Business Rules). Chỉ Admin mới có quyền thay đổi các thông số này.
              </p>
            </div>
            <div className="flex-1 min-h-0">
              <AdminSystemConfig readOnly={true} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
