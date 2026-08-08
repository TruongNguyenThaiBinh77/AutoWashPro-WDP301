import { useState, useEffect } from 'react';
import { CaretLeft, CaretRight, ArrowRight } from '@phosphor-icons/react';

/**
 * Reusable Customer Pagination Component
 * - Shows condensed page pills (first few, middle, last few with ellipsis)
 * - Allows direct page jump by typing number and pressing Enter
 * 
 * @param {Object} props
 * @param {Object} props.pagination - { page, totalPages, total, limit }
 * @param {number} props.page - Current page number
 * @param {number} props.totalPages - Total pages (fallback if pagination object not provided)
 * @param {number} props.total - Total records (fallback)
 * @param {number} props.limit - Items per page
 * @param {Function} props.setPage - Callback to change page
 * @param {string} props.itemName - Name of items (e.g. 'mục', 'lịch hẹn', 'giao dịch', 'thông báo')
 * @param {boolean} props.showJump - Show jump-to-page input (default: true)
 * @param {boolean} props.showTotal - Show total items text (default: true)
 * @param {string} props.className - Extra CSS classes
 */
export default function CustomerPagination({
  pagination,
  page: pageProp,
  totalPages: totalPagesProp,
  total: totalProp,
  limit: limitProp = 10,
  setPage,
  itemName = 'mục',
  showJump = true,
  showTotal = true,
  className = '',
}) {
  const page = pagination?.page ?? pageProp ?? 1;
  const totalPages = pagination?.totalPages ?? totalPagesProp ?? 1;
  const total = pagination?.total ?? totalProp ?? 0;
  const limit = pagination?.limit ?? limitProp ?? 10;

  const [jumpValue, setJumpValue] = useState('');

  // Keep jump input in sync with current page when page changes
  useEffect(() => {
    setJumpValue('');
  }, [page]);

  if (totalPages <= 1 && (!total || total <= limit)) {
    return null;
  }

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total > 0 ? total : page * limit);

  // Generate condensed page list
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    if (page <= 4) {
      // Near beginning: 1, 2, 3, 4, 5, '...', totalPages
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    } else if (page >= totalPages - 3) {
      // Near end: 1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages
      pages.push(1);
      pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      // In middle: 1, '...', page - 1, page, page + 1, '...', totalPages
      pages.push(1);
      pages.push('...');
      pages.push(page - 1);
      pages.push(page);
      pages.push(page + 1);
      pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const handleJumpSubmit = (e) => {
    if (e) e.preventDefault();
    const target = parseInt(jumpValue, 10);
    if (!isNaN(target)) {
      const validPage = Math.max(1, Math.min(totalPages, target));
      setPage(validPage);
      setJumpValue('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleJumpSubmit(e);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2.5 mt-6 pt-5 border-t border-slate-100 text-xs ${className}`}>
      {/* Pagination controls & Jump Input (Centered) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Prev button */}
        <button
          type="button"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-all cursor-pointer"
          title="Trang trước"
        >
          <CaretLeft size={14} weight="bold" />
          <span className="hidden sm:inline">Trước</span>
        </button>

        {/* Page pills */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((pNum, idx) => (
            pNum === '...' ? (
              <span key={`dots-${idx}`} className="px-1.5 py-1 text-slate-400 font-bold select-none">
                ...
              </span>
            ) : (
              <button
                key={pNum}
                type="button"
                onClick={() => setPage(pNum)}
                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  page === pNum
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {pNum}
              </button>
            )
          ))}
        </div>

        {/* Next button */}
        <button
          type="button"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-all cursor-pointer"
          title="Trang sau"
        >
          <span className="hidden sm:inline">Sau</span>
          <CaretRight size={14} weight="bold" />
        </button>

        {/* Quick jump input */}
        {showJump && totalPages > 1 && (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5 ml-1 pl-2 border-l border-slate-200">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Đến:</span>
            <div className="relative flex items-center">
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpValue}
                placeholder={String(page)}
                onChange={(e) => setJumpValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-12 h-8 px-1.5 text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300"
                title="Nhập số trang và ấn Enter"
              />
            </div>
            <button
              type="submit"
              disabled={!jumpValue}
              className="h-8 px-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center cursor-pointer"
              title="Đi tới trang này"
            >
              <ArrowRight size={12} weight="bold" />
            </button>
            <span className="text-[11px] text-slate-400 font-medium">/{totalPages}</span>
          </form>
        )}
      </div>

      {/* Total items info (Centered) */}
      {showTotal && total > 0 && (
        <div className="text-slate-400 font-medium text-[11px] text-center">
          Hiển thị <strong className="text-slate-700 font-bold">{startItem} - {endItem}</strong> trên tổng số <strong className="text-slate-700 font-bold">{total.toLocaleString('vi-VN')}</strong> {itemName}
        </div>
      )}
    </div>
  );
}
