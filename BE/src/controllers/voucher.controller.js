const voucherService = require('../services/voucher.service');
const { catchAsync, success } = require('../utils/helpers');

exports.createVoucher = catchAsync(async (req, res) => {
  const branchId = req.user.role === 'manager' ? req.user.branchId : req.body.branchId;
  if (req.user.role === 'manager' && !branchId) {
    throw Object.assign(new Error('Manager must have a branch assigned'), { statusCode: 400, code: 'MANAGER_NO_BRANCH' });
  }
  const voucher = await voucherService.createVoucher({ ...req.body, createdBy: req.userId, branchId });
  success(res, voucher, 'Tạo mã giảm giá thành công', 201);
});

exports.getAllVouchers = catchAsync(async (req, res) => {
  const result = await voucherService.getAllVouchers(req.query, req.user.role, req.userId, req.user.branchId);
  success(res, result.data, 'Đã lấy danh sách mã giảm giá', 200, result.pagination);
});

exports.getVoucherStats = catchAsync(async (req, res) => {
  const stats = await voucherService.getVoucherStats(req.user.role, req.userId, req.user.branchId);
  success(res, stats, 'Đã lấy thống kê mã giảm giá');
});

exports.getVoucherById = catchAsync(async (req, res) => {
  const voucher = await voucherService.getVoucherById(req.params.id, req.user.role, req.userId, req.user.branchId);
  success(res, voucher, 'Đã lấy thông tin mã giảm giá');
});

exports.getPublicVouchersByBranch = catchAsync(async (req, res) => {
  const vouchers = await voucherService.getPublicVouchersByBranch(req.query.branchId);
  success(res, vouchers, 'Đã lấy danh sách mã giảm giá');
});

exports.getVoucherByCode = catchAsync(async (req, res) => {
  const voucher = await voucherService.getVoucherByCode(req.params.code, req.query.branchId);
  success(res, voucher, 'Đã lấy thông tin mã giảm giá');
});

exports.updateVoucher = catchAsync(async (req, res) => {
  const voucher = await voucherService.updateVoucher(req.params.id, req.body, req.user.role, req.userId, req.user.branchId);
  success(res, voucher, 'Cập nhật mã giảm giá thành công');
});

exports.deleteVoucher = catchAsync(async (req, res) => {
  await voucherService.deleteVoucher(req.params.id, req.user.role, req.userId, req.user.branchId);
  success(res, null, 'Đã xóa mã giảm giá');
});

exports.validateVoucher = catchAsync(async (req, res) => {
  const { code, bookingData } = req.body;
  const result = await voucherService.validateVoucher(code, bookingData, req.userId);
  success(res, result, 'Xác thực mã giảm giá thành công');
});

exports.reserveVoucher = catchAsync(async (req, res) => {
  const { code, bookingId, discountAmount } = req.body;
  const result = await voucherService.reserveVoucher(code, req.userId, bookingId, discountAmount || 0);
  success(res, result, 'Đã giữ mã giảm giá');
});

exports.rollbackVoucher = catchAsync(async (req, res) => {
  const { code, bookingId } = req.body;
  await voucherService.rollbackVoucher(code, req.userId, bookingId);
  success(res, null, 'Hủy giữ mã giảm giá thành công');
});

exports.getVoucherUsage = catchAsync(async (req, res) => {
  const result = await voucherService.getVoucherUsage(req.params.id, req.query);
  success(res, result.data, 'Đã lấy lịch sử sử dụng mã giảm giá', 200, result.pagination);
});

exports.getVoucherUsageReport = catchAsync(async (req, res) => {
  const report = await voucherService.getVoucherUsageReport(req.query);
  success(res, report, 'Đã lấy báo cáo sử dụng mã giảm giá');
});

exports.getUserVouchers = catchAsync(async (req, res) => {
  const vouchers = await voucherService.getUserVouchers(req.userId);
  success(res, vouchers, 'Đã lấy danh sách mã giảm giá của người dùng');
});

exports.getAvailableVouchers = catchAsync(async (req, res) => {
  const result = await voucherService.getAvailableVouchersForUser(req.userId, req.query.branchId, req.query);
  success(res, result, 'Đã lấy danh sách mã giảm giá khả dụng');
});

exports.redeemPoints = catchAsync(async (req, res) => {
  const { templateId } = req.body;
  if (!templateId) throw Object.assign(new Error('Voucher template ID is required'), { statusCode: 400 });
  
  const userVoucher = await voucherService.redeemPointsForVoucher(templateId, req.userId);
  success(res, userVoucher, 'Đổi điểm lấy mã giảm giá thành công', 201);
});
