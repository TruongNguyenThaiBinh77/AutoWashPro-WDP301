import { useState, useEffect } from 'react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { toast } from 'react-hot-toast';
import { Clock, CalendarX, Plus, Trash, Check, X, WarningCircle } from '@phosphor-icons/react';

export default function ManagerScheduleConfig({ branchId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    morning: { start: '07:00', end: '11:30' },
    afternoon: { start: '13:00', end: '18:00' },
    daysOff: [],
    blockedSlots: []
  });

  const [newDayOff, setNewDayOff] = useState('');
  
  const [newBlockedSlot, setNewBlockedSlot] = useState({
    date: '',
    startTime: '',
    endTime: '',
    reason: ''
  });

  const fetchBranch = async () => {
    try {
      setLoading(true);
      const apiBase = getApiBaseUrl();
      const headers = { Authorization: `Bearer ${getStoredToken()}` };
      const res = await fetch(`${apiBase}/branches/${branchId}`, { headers });
      const data = await res.json();
      if (data.data?.scheduleConfig) {
        const sc = data.data.scheduleConfig;
        setConfig({
          morning: sc.morning || { start: '07:00', end: '11:30' },
          afternoon: sc.afternoon || { start: '13:00', end: '18:00' },
          daysOff: sc.daysOff || [],
          blockedSlots: sc.blockedSlots || [],
          slotInterval: sc.slotInterval || 30
        });
      }
    } catch (err) {
      toast.error('Lỗi khi tải cấu hình chi nhánh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (branchId) fetchBranch();
  }, [branchId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const apiBase = getApiBaseUrl();
      const headers = { 
        Authorization: `Bearer ${getStoredToken()}`,
        'Content-Type': 'application/json'
      };
      await fetch(`${apiBase}/branches/${branchId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ scheduleConfig: config })
      });
      toast.success('Cập nhật lịch hoạt động thành công');
      fetchBranch();
    } catch (err) {
      toast.error('Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const handleAddDayOff = () => {
    if (!newDayOff) return;
    if (config.daysOff.includes(newDayOff)) return toast.error('Ngày này đã có trong danh sách');
    setConfig(prev => ({ ...prev, daysOff: [...prev.daysOff, newDayOff].sort() }));
    setNewDayOff('');
  };

  const handleRemoveDayOff = (date) => {
    setConfig(prev => ({ ...prev, daysOff: prev.daysOff.filter(d => d !== date) }));
  };

  const handleAddBlockedSlot = () => {
    if (!newBlockedSlot.date || !newBlockedSlot.startTime || !newBlockedSlot.endTime) {
      return toast.error('Vui lòng điền đủ ngày và giờ');
    }
    setConfig(prev => ({
      ...prev,
      blockedSlots: [...prev.blockedSlots, { ...newBlockedSlot }].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    }));
    setNewBlockedSlot({ date: '', startTime: '', endTime: '', reason: '' });
  };

  const handleRemoveBlockedSlot = (index) => {
    setConfig(prev => {
      const newBlocked = [...prev.blockedSlots];
      newBlocked.splice(index, 1);
      return { ...prev, blockedSlots: newBlocked };
    });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Lịch Hoạt Động & Ngày Nghỉ</h2>
          <p className="text-sm text-slate-500 mt-1">Cấu hình khung giờ làm việc, ngày nghỉ lễ và khóa giờ tạm thời</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? 'Đang lưu...' : <><Check weight="bold" /> Lưu Cấu Hình</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Working Hours */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Clock className="text-blue-500" size={20} /> Khung Giờ Làm Việc
          </h3>
          
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Buổi Sáng</h4>
              <div className="flex items-center gap-3">
                <input 
                  type="time" 
                  value={config.morning.start}
                  onChange={e => setConfig({ ...config, morning: { ...config.morning, start: e.target.value }})}
                  className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-full" 
                />
                <span className="text-slate-400">đến</span>
                <input 
                  type="time" 
                  value={config.morning.end}
                  onChange={e => setConfig({ ...config, morning: { ...config.morning, end: e.target.value }})}
                  className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-full" 
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Buổi Chiều</h4>
              <div className="flex items-center gap-3">
                <input 
                  type="time" 
                  value={config.afternoon.start}
                  onChange={e => setConfig({ ...config, afternoon: { ...config.afternoon, start: e.target.value }})}
                  className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-full" 
                />
                <span className="text-slate-400">đến</span>
                <input 
                  type="time" 
                  value={config.afternoon.end}
                  onChange={e => setConfig({ ...config, afternoon: { ...config.afternoon, end: e.target.value }})}
                  className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-full" 
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Khoảng Cách Giữa Các Khung Giờ (phút)</h4>
              <div className="flex items-center gap-3">
                <input 
                  type="number" 
                  min="15"
                  step="15"
                  value={config.slotInterval || 30}
                  onChange={e => setConfig({ ...config, slotInterval: parseInt(e.target.value, 10) || 30 })}
                  className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-full" 
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">Xác định các mốc thời gian hiển thị cho khách chọn (VD: 30 phút sẽ hiển thị 07:00, 07:30, 08:00...)</p>
            </div>
          </div>
        </div>

        {/* Days Off */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <CalendarX className="text-red-500" size={20} /> Ngày Nghỉ (Đóng Cửa)
          </h3>
          <p className="text-xs text-slate-500">Chi nhánh sẽ không nhận khách trong toàn bộ các ngày này.</p>
          
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={newDayOff}
              onChange={e => setNewDayOff(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 outline-none w-full" 
            />
            <button 
              onClick={handleAddDayOff}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-md"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 max-h-[250px] overflow-y-auto">
            {config.daysOff.length === 0 && <span className="text-sm text-slate-400 italic">Chưa có ngày nghỉ nào</span>}
            {config.daysOff.map(date => {
              const d = new Date(date);
              const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
              return (
              <div key={date} className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 px-3 py-1.5 rounded-full text-sm">
                <span>{formattedDate}</span>
                <button onClick={() => handleRemoveDayOff(date)} className="text-red-400 hover:text-red-600">
                  <X weight="bold" />
                </button>
              </div>
            )})}
          </div>
        </div>
      </div>

      {/* Blocked Slots */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <WarningCircle className="text-orange-500" size={20} /> Khóa Khung Giờ Tạm Thời
        </h3>
        <p className="text-sm text-slate-500">Dùng để đóng tạm một khoảng thời gian trong ngày (VD: bảo trì, liên hoan...). Nhấp vào khung giờ để khóa hoặc mở khóa.</p>
        
        <div className="flex flex-wrap items-end gap-3 p-4 bg-orange-50/50 rounded-lg border border-orange-100">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Chọn ngày để cấu hình</label>
            <input 
              type="date" 
              value={newBlockedSlot.date} 
              onChange={e => setNewBlockedSlot({...newBlockedSlot, date: e.target.value})} 
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 outline-none" 
            />
          </div>
          <div className="flex-2 min-w-[300px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Lý do khóa (Tùy chọn)</label>
            <input 
              type="text" 
              placeholder="VD: Bảo trì máy bơm..." 
              value={newBlockedSlot.reason} 
              onChange={e => setNewBlockedSlot({...newBlockedSlot, reason: e.target.value})} 
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 outline-none" 
            />
          </div>
        </div>

        {newBlockedSlot.date ? (() => {
          const parseTime = (timeStr) => {
            if (!timeStr) return null;
            const [h, m] = timeStr.split(':');
            return parseInt(h, 10) * 60 + parseInt(m, 10);
          };
          const interval = config.slotInterval || 30;
          const slots = [];
          
          ['morning', 'afternoon'].forEach(session => {
            if (config[session]?.start && config[session]?.end) {
              const open = parseTime(config[session].start);
              const close = parseTime(config[session].end);
              if (open !== null && close !== null) {
                for (let current = open; current < close; current += interval) {
                  const start = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
                  const endH = Math.floor((current + interval) / 60);
                  const endM = (current + interval) % 60;
                  const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                  slots.push({ startTime: start, endTime: end, session });
                }
              }
            }
          });

          const toggleSlot = (s) => {
            setConfig(prev => {
              const exists = prev.blockedSlots.findIndex(b => b.date === newBlockedSlot.date && b.startTime === s.startTime);
              let newBlocked = [...prev.blockedSlots];
              if (exists >= 0) {
                newBlocked.splice(exists, 1); // Unblock
              } else {
                newBlocked.push({
                  date: newBlockedSlot.date,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  reason: newBlockedSlot.reason
                });
                newBlocked.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
              }
              return { ...prev, blockedSlots: newBlocked };
            });
          };

          const isBlocked = (startTime) => {
            return config.blockedSlots.some(b => b.date === newBlockedSlot.date && b.startTime === startTime);
          };

          const renderGrid = (title, sessionName) => {
            const filtered = slots.filter(s => s.session === sessionName);
            if (filtered.length === 0) return null;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-600">
                  <h4 className="text-xs font-bold uppercase tracking-wider">{title}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filtered.map(s => {
                    const blocked = isBlocked(s.startTime);
                    return (
                      <button
                        key={s.startTime}
                        onClick={() => toggleSlot(s)}
                        className={`relative flex flex-col items-center justify-center min-w-[76px] h-[54px] rounded-xl border font-semibold transition-all duration-200 ${
                          blocked
                            ? 'border-red-500 bg-red-500 text-white shadow-md shadow-red-500/10'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-sm">{s.startTime}</span>
                        {blocked && <span className="text-[10px] leading-none mt-1 font-medium text-red-100">Đã khóa</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          };

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 mt-4">
              {renderGrid('Khung giờ buổi sáng', 'morning')}
              {renderGrid('Khung giờ buổi chiều', 'afternoon')}
            </div>
          );
        })() : (
          <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
            Vui lòng chọn ngày để xem và khóa khung giờ
          </div>
        )}

        {/* Existing block list summary (optional but good for review) */}
        {config.blockedSlots.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Danh sách khung giờ đã khóa</h4>
            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-2">
              {config.blockedSlots.map((slot, idx) => {
                const d = new Date(slot.date);
                const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                return (
                  <div key={idx} className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-1.5 rounded-lg text-sm">
                    <span className="font-semibold">{formattedDate}</span>
                    <span>{slot.startTime} - {slot.endTime}</span>
                    <button onClick={() => handleRemoveBlockedSlot(idx)} className="text-orange-400 hover:text-red-500 ml-1">
                      <X weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
