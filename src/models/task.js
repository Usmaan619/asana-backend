import mongoose from "mongoose";

import autoIncrement from "mongoose-auto-increment";

const connection = mongoose.createConnection(process.env.MONGO_URI);

autoIncrement.initialize(connection);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },

    ticketNo: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String },

    status: {
      type: String,
      enum: ["open", "pending", "in-progress", "testing", "completed", "done"],
      default: "open",
    },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    dueDate: { type: Date },

    file: {
      data: Buffer,
      contentType: String, // MIME type
      originalname: String,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    comments: [
      {
        text: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        createdAt: { type: Date, default: Date.now },
      },
    ],

    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    createdAt: { type: Date, default: Date.now },
  },

  {
    timestamps: true,
  }
);

taskSchema.plugin(autoIncrement.plugin, {
  model: "Task",
  field: "ticketNo",
  startAt: 10000,
  incrementBy: 1,
});

export const Task = mongoose.model("Task", taskSchema);
