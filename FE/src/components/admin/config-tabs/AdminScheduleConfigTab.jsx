import { useState, useEffect } from 'react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import ManagerScheduleConfig from '@/components/manager/ManagerScheduleConfig';
import { toast } from 'react-hot-toast';

export default function AdminScheduleConfigTab() {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const apiBase = getApiBaseUrl();
        const headers = { Authorization: `Bearer ${getStoredToken()}` };
        const res = await fetch(`${apiBase}/branches`, { headers });
        const data = await res.json();
        setBranches(data.data || []);
        if (data.data?.length > 0) {
          setSelectedBranch(data.data[0]._id);
        }
      } catch (err) {
        toast.error('Lỗi tải danh sách chi nhánh');
      } finally {
        setLoading(false);
      }
    };
    fetchBranches();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-4 bg-white border-b border-slate-200">
        <label className="block text-sm font-medium text-slate-700 mb-2">Chọn chi nhánh để cấu hình lịch:</label>
        <select 
          className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
        >
          {branches.map(b => (
            <option key={b._id} value={b._id}>{b.name} - {b.address}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto">
        {selectedBranch ? (
          <ManagerScheduleConfig branchId={selectedBranch} />
        ) : (
          <div className="p-8 text-center text-slate-500">Chưa chọn chi nhánh</div>
        )}
      </div>
    </div>
  );
}
