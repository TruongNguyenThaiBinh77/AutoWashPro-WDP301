import { useState, useEffect } from 'react';
import { X, CarProfile, MapPin, Storefront, HandCoins, Lightning } from '@phosphor-icons/react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { toast } from 'react-hot-toast';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
    ...opts,
  });
}

export default function ManagerWalkInBookingModal({ onClose, onSuccess, user }) {
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [branches, setBranches] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    licensePlate: '',
    phone: '',
    packageId: '',
    branchId: user?.branchId || '',
  });

  useEffect(() => {
    // Fetch branches if admin
    if (user?.role === 'admin') {
      api('/branches?limit=100&status=active')
        .then(res => res.json())
        .then(data => {
          const list = data?.data?.branches || data?.data || [];
          setBranches(Array.isArray(list) ? list : []);
          if (list.length > 0 && !formData.branchId) {
            setFormData(prev => ({ ...prev, branchId: list[0]._id }));
          }
        });
    }
  }, [user]);

  useEffect(() => {
    // Fetch packages dependent on selected branch
    if (formData.branchId) {
      api(`/packages?limit=100&status=active&branchId=${formData.branchId}`)
        .then(res => res.json())
        .then(data => {
          const list = data?.data?.packages || data?.data || [];
          setPackages(Array.isArray(list) ? list : []);
          
          setFormData(prev => {
            const currentValid = list.some(p => p._id === prev.packageId);
            if (!currentValid && list.length > 0) {
              return { ...prev, packageId: list[0]._id };
            } else if (!currentValid) {
              return { ...prev, packageId: '' };
            }
            return prev;
          });
        });
    } else {
      setPackages([]);
      setFormData(prev => ({ ...prev, packageId: '' }));
    }
  }, [formData.branchId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.licensePlate || !formData.packageId || !formData.branchId) {
      toast.error('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }
    if (!formData.email && !formData.phone) {
      toast.error('Vui lòng nhập ít nhất Email hoặc Số điện thoại');
      return;
    }
    setLoading(true);
    
    try {
      const bookingRes = await api('/bookings/walk-in', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          licensePlate: formData.licensePlate,
          branchId: formData.branchId,
          packageId: formData.packageId,
        })
      });
      
      const bookingData = await bookingRes.json();
      if (!bookingRes.ok) throw new Error(bookingData.message || 'Lỗi khi tạo đơn đặt lịch');
      const newBooking = bookingData.data;
      toast.success(bookingData.message || 'Tạo đơn thành công!', { duration: 5000 });
      onSuccess?.(newBooking);
      onClose();
      
    } catch (err) {
      toast.error(err.message || 'Đã xảy ra lỗi hệ thống');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between border-b border-slate-100 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Lightning size={18} weight="fill" className="text-blue-600" />
            <h2 className="font-semibold text-slate-800">Tạo đơn vãng lai nhanh</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Tên khách hàng *</label>
            <input
              autoFocus
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nhập tên khách hàng"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email (Khuyên dùng)</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="VD: khach@gmail.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Số điện thoại</label>
              <input
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="VD: 0987654321"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic -mt-2">Vui lòng nhập Email hoặc SĐT để hệ thống lưu lịch sử cho khách.</p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Biển số xe *</label>
            <div className="relative">
              <CarProfile size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                required
                value={formData.licensePlate}
                onChange={e => setFormData({ ...formData, licensePlate: e.target.value })}
                placeholder="VD: 51H-123.45"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Gói dịch vụ *</label>
            <div className="relative">
              <HandCoins size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                required
                value={formData.packageId}
                onChange={e => setFormData({ ...formData, packageId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"
              >
                <option value="">-- Chọn gói dịch vụ --</option>
                {packages.map(pkg => (
                  <option key={pkg._id} value={pkg._id}>{pkg.name} - {pkg.price.toLocaleString('vi-VN')}đ</option>
                ))}
              </select>
            </div>
          </div>

          {user?.role === 'admin' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Chi nhánh *</label>
              <div className="relative">
                <Storefront size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  required
                  value={formData.branchId}
                  onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"
                >
                  <option value="">-- Chọn chi nhánh --</option>
                  {branches.map(br => (
                    <option key={br._id} value={br._id}>{br.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Đang xử lý...' : 'Tạo đơn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
