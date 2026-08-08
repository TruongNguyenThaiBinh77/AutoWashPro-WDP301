const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 50 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true },
    openingTime: { type: String, default: '07:00' },
    closingTime: { type: String, default: '18:00' },
    scheduleConfig: {
      morning: {
        start: { type: String, default: '07:00' },
        end: { type: String, default: '11:30' }
      },
      afternoon: {
        start: { type: String, default: '13:00' },
        end: { type: String, default: '18:00' }
      },
      daysOff: [{ type: String }], // format YYYY-MM-DD
      blockedSlots: [
        {
          date: { type: String },
          startTime: { type: String },
          endTime: { type: String },
          reason: { type: String }
        }
      ],
      slotInterval: { type: Number, default: 30 }
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    image: { type: String },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mapCoordinates: {
      svgCx: { type: Number },
      svgCy: { type: Number },
    },
    packageSortOrder: {
      type: String,
      enum: ['price_asc', 'price_desc', 'booking_count'],
      default: 'price_asc',
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

branchSchema.index({ name: 1 });
branchSchema.index({ status: 1 });
branchSchema.index({ location: '2dsphere' });
branchSchema.index({ managerId: 1 });

module.exports = mongoose.model('Branch', branchSchema);
