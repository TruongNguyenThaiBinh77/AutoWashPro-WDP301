const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../utils/helpers');
const { voucherValidators } = require('../utils/validators');
const voucherController = require('../controllers/voucher.controller');
const { ROLES } = require('../config/permissions');

/**
 * @swagger
 * /api/vouchers:
 *   post:
 *     summary: Tạo voucher mới
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VoucherInput'
 *     responses:
 *       201:
 *         description: Tạo voucher thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Voucher'
 *       409:
 *         description: Mã voucher đã tồn tại
 */
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), voucherValidators.create, validate, voucherController.createVoucher);

/**
 * @swagger
 * /api/vouchers:
 *   get:
 *     summary: Lấy danh sách voucher (admin/manager)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo mã hoặc tên voucher
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Lọc theo trạng thái
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [percentage, fixed]
 *         description: Lọc theo loại voucher
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Lọc từ ngày bắt đầu
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Lọc đến ngày bắt đầu
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Số item mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách voucher với phân trang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Voucher'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 */
router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), voucherController.getAllVouchers);
router.get('/stats', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), voucherController.getVoucherStats);
router.get('/public', voucherController.getPublicVouchersByBranch);

/**
 * @swagger
 * /api/vouchers/me:
 *   get:
 *     summary: Lấy voucher đã sử dụng của tôi
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách voucher đã dùng
 */
router.get('/me', authenticate, voucherController.getUserVouchers);

/**
 * @swagger
 * /api/vouchers/available:
 *   get:
 *     summary: Lấy voucher khả dụng cho tôi
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Voucher phân loại theo tier_exclusive, public, redeemable
 */
router.get('/available', authenticate, voucherController.getAvailableVouchers);

/**
 * @swagger
 * /api/vouchers/code/{code}:
 *   get:
 *     summary: Lấy voucher theo mã
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Mã voucher
 *     responses:
 *       200:
 *         description: Thông tin voucher
 *       404:
 *         description: Không tìm thấy voucher
 */
router.get('/code/:code', authenticate, voucherController.getVoucherByCode);

/**
 * @swagger
 * /api/vouchers/usage-report:
 *   get:
 *     summary: Báo cáo sử dụng voucher
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Báo cáo tổng hợp theo user
 */
router.get('/usage-report', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), voucherController.getVoucherUsageReport);

/**
 * @swagger
 * /api/vouchers/usage/{id}:
 *   get:
 *     summary: Lịch sử sử dụng voucher (có phân trang)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Voucher ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Số item mỗi trang
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Lọc từ ngày sử dụng
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Lọc đến ngày sử dụng
 *     responses:
 *       200:
 *         description: Lịch sử sử dụng với phân trang
 */
router.get('/usage/:id', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), voucherController.getVoucherUsage);

/**
 * @swagger
 * /api/vouchers/{id}:
 *   get:
 *     summary: Lấy voucher theo ID
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin voucher
 *       404:
 *         description: Không tìm thấy voucher
 */
router.get('/:id', authenticate, voucherController.getVoucherById);

/**
 * @swagger
 * /api/vouchers/{id}:
 *   put:
 *     summary: Cập nhật voucher
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VoucherInput'
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy voucher
 */
router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), voucherValidators.update, validate, voucherController.updateVoucher);

/**
 * @swagger
 * /api/vouchers/{id}:
 *   delete:
 *     summary: Xóa voucher (admin only)
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy voucher
 */
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), voucherController.deleteVoucher);

/**
 * @swagger
 * /api/vouchers/validate:
 *   post:
 *     summary: Validate voucher code
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *               bookingData:
 *                 type: object
 *                 properties:
 *                   packageId: { type: string }
 *                   branchId: { type: string }
 *                   amount: { type: number }
 *     responses:
 *       200:
 *         description: Voucher hợp lệ
 *       400:
 *         description: Voucher không hợp lệ
 */
router.post('/validate', authenticate, voucherValidators.validate, validate, voucherController.validateVoucher);

/**
 * @swagger
 * /api/vouchers/redeem-points:
 *   post:
 *     summary: Đổi điểm lấy voucher
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateId]
 *             properties:
 *               templateId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đổi điểm thành công
 *       400:
 *         description: Điểm không đủ
 */
router.post('/redeem-points', authenticate, voucherController.redeemPoints);

/**
 * @swagger
 * /api/vouchers/reserve:
 *   post:
 *     summary: Reserve voucher cho booking
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, bookingId]
 *             properties:
 *               code: { type: string }
 *               bookingId: { type: string }
 *               discountAmount: { type: number }
 *     responses:
 *       200:
 *         description: Reserve thành công
 *       400:
 *         description: Voucher hết hạn hoặc đã dùng hết
 */
router.post('/reserve', authenticate, voucherValidators.reserve, validate, voucherController.reserveVoucher);

/**
 * @swagger
 * /api/vouchers/rollback:
 *   post:
 *     summary: Rollback voucher reservation
 *     tags: [Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, bookingId]
 *             properties:
 *               code: { type: string }
 *               bookingId: { type: string }
 *     responses:
 *       200:
 *         description: Rollback thành công
 */
router.post('/rollback', authenticate, voucherValidators.rollback, validate, voucherController.rollbackVoucher);

module.exports = router;
