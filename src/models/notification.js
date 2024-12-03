import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    message: { type: String, required: true },

    seen: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const Notification = mongoose.model("Notification", notificationSchema);
