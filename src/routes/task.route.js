import express from "express";
import { Task } from "../models/task.js";
import { User } from "../models/user.js";
import pkg from "rest-api-errors";
import { authMiddleware } from "../middleware/checkAuth.js";
import { TaskDaily } from "../models/tastDailyUpdate.js";
import moment from "moment/moment.js";
import mongoose from "mongoose";
import multer from "multer";
import { Notification } from "../models/notification.js";

const { APIError } = pkg;
const router = express();

const createNotification = async (userId, message) => {
  try {
    await Notification.create({
      userId,
      message,
    });
  } catch (error) {
    throw error;
  }
};

// Get all tasks
router.get("/getAllTasks", authMiddleware, async (req, res, next) => {
  try {
    const tasks = await Task.find()
      .populate({
        path: "assignedTo",
        select: "_id name",
      })
      .populate({
        path: "createdBy",
        select: "_id name",
      })
      .populate({
        path: "collaborators",
        select: "_id name",
      })

      .populate({
        path: "comments.createdBy",
        select: "_id name",
      })
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// Set up multer for file handling (in-memory)
const storage = multer.memoryStorage();
const fileParser = multer({ storage }).single("file"); // single file upload

const parseCollaborators = (collaboratorsJson) => {
  try {
    if (!collaboratorsJson) return [];

    const collaboratorsArray = JSON.parse(collaboratorsJson);
    const objectIdArray = [];

    // Iterate using for...of loop
    for (const c of collaboratorsArray) {
      if (!mongoose.Types.ObjectId.isValid(c?._id)) {
        throw new Error(`Invalid ObjectId format: ${c?.id}`);
      }
      objectIdArray.push(mongoose.Types.ObjectId(c?._id)); // Convert to ObjectId and add to the result array
    }

    return objectIdArray;
  } catch (error) {
    throw new Error(`Failed to parse collaborators: ${error.message}`);
  }
};

// Utility function to update collaborators' task lists
const updateCollaborators = async (collaborators, taskId) => {
  if (collaborators.length > 0) {
    return User.updateMany(
      { _id: { $in: collaborators } },
      { $push: { tasks: taskId } }
    );
  }
};

// Utility function to add task to the assigned user's list
const addTaskToAssignedUser = async (assignedTo, taskId) => {
  if (assignedTo) {
    const user = await User.findById(assignedTo);
    if (user) {
      user.tasks.push(taskId);
      await user.save();
    }
  }
};

const notifyCollaborators = async (collaborators, taskTitle) => {
  for (const collaboratorId of collaborators) {
    await createNotification(
      collaboratorId,
      `You are a collaborator on the new task: ${taskTitle}`
    );
  }
};

router.post("/create", fileParser, authMiddleware, async (req, res, next) => {
  try {
    const { title, description, assignedTo, dueDate, priority, status } =
      req?.body;

    // Parse collaborators from JSON
    const collaborators = parseCollaborators(req?.body?.collaborators);

    // File handling
    const file = req?.file
      ? {
          data: req?.file?.buffer, // Store file in Buffer format
          contentType: req?.file?.mimetype, // Store file MIME type
          originalname: req?.file?.originalname,
        }
      : null;

    // Create a new task
    const task = new Task({
      title,
      description,
      assignedTo: assignedTo ? mongoose.Types.ObjectId(assignedTo) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
      status,
      file,
      collaborators,
      createdBy: req?.user?._id,
    });
    // nofication
    await createNotification(
      req?.user?._id,
      `You have been assigned to task: ${task?.title}`
    );

    // Save the task in MongoDB
    await task.save();

    // Update collaborators and assigned user asynchronously
    await Promise.all([
      updateCollaborators(collaborators, task._id),
      addTaskToAssignedUser(assignedTo, task._id),
      notifyCollaborators(collaborators, task.title),
    ]);

    res.json({ success: true, message: "Task Created Successfully", task });
  } catch (error) {
    next(error); // Centralized error handling
  }
});

// router.post("/create", fileParser, authMiddleware, async (req, res, next) => {
//   try {
//     const { title, description, assignedTo, dueDate, priority, status } =
//       req?.body;

//     const collaborators = parseCollaborators(req?.body?.collaborators);

//     const file = req?.file
//       ? {
//           data: req?.file?.buffer,
//           contentType: req?.file?.mimetype,
//           originalname: req?.file?.originalname,
//         }
//       : null;

//     const task = new Task({
//       title,
//       description,
//       assignedTo: assignedTo ? mongoose.Types.ObjectId(assignedTo) : null,
//       dueDate: dueDate ? new Date(dueDate) : null,
//       priority,
//       status,
//       file,
//       collaborators,
//       createdBy: req?.user?._id,
//     });

//     await task.save();

//     await createNotification(
//       req?.user?._id,
//       `You created the task: ${task.title}`
//     );

//     if (assignedTo) {
//       notifyTaskCreated(assignedTo, {
//         taskId: task._id,
//         message: `You have been assigned to task: ${task.title}`,
//         createdAt: new Date(),
//       });
//     }

//     collaborators.forEach((collaboratorId) => {
//       notifyTaskCreated(collaboratorId, {
//         taskId: task._id,
//         message: `You are a collaborator on the new task: ${task.title}`,
//         createdAt: new Date(),
//       });
//     });

//     await Promise.all([
//       updateCollaborators(collaborators, task._id),
//       addTaskToAssignedUser(assignedTo, task._id),
//       notifyCollaborators(collaborators, task.title),
//     ]);

//     res.json({ success: true, message: "Task Created Successfully", task });
//   } catch (error) {
//     next(error);
//   }
// });

router.post("/updateTask/:id", authMiddleware, async (req, res, next) => {
  try {
    const {
      status,
      comments,
      title,
      dueDate,
      priority,
      description,
      assignedTo,
      collaborators,
    } = req.body;

    const task = await Task.findById(req?.params?.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (title) task.title = title;
    if (status) task.status = status;
    if (dueDate) task.dueDate = dueDate;
    if (description) task.description = description;
    if (assignedTo) {
      // Check if the assigned user has changed
      if (task.assignedTo.toString() !== assignedTo) {
        // Notify the new assigned user
        await createNotification(
          assignedTo,
          `You have been assigned to task: ${task.title}`
        );
      }
      task.assignedTo = assignedTo;
    }
    if (priority) task.priority = priority;

    if (collaborators) {
      const collaboratorIds = [
        ...new Set(collaborators.map((collab) => collab?._id)),
      ];

      // Filter out collaborators that are not in the provided `collaborators` array
      task.collaborators = task.collaborators.filter((existingCollaborator) =>
        collaboratorIds.includes(existingCollaborator.toString())
      );

      // Add new collaborators (those not already in the task)
      const newCollaborators = collaboratorIds.filter(
        (collabId) => !task?.collaborators.includes(collabId)
      );

      task.collaborators.push(...newCollaborators);

      // Notify new collaborators
      if (newCollaborators.length > 0) {
        await notifyCollaborators(newCollaborators, task.title);
      }
    }

    if (comments) {
      task.comments.push({
        text: comments,
        createdBy: req.user.id,
      });
    }

    await task.save();

    res.json({
      success: true,
      message: "Task updated successfully",
    });
  } catch (error) {
    next(error);
  }
});

// Update a task (e.g., change status, description)
router.put("/updateTaskStatus_old/:id", async (req, res, next) => {
  try {
    // passs a task id
    const updatedTask = await Task.findByIdAndUpdate(
      req?.params?.id,
      req?.body,
      {
        new: true,
      }
    );
    console.log("updatedTask: ", updatedTask);

    res.json({ success: true, message: "Update task successfully" });
  } catch (error) {
    next(error);
  }
});
// in
router.post(
  "/createTaskDailyUpdate",
  authMiddleware,
  async (req, res, next) => {
    try {
      const { ticketNo, about, date, description, tags } = req.body;

      // Check if the ticket exists
      const existingTicket = await Task.findOne({ ticketNo });
      if (!existingTicket) {
        throw new APIError(404, "Ticket number not found");
      }

      // Create a new daily task
      const task = await TaskDaily.create({
        ticketNo,
        about,
        date: date || new Date(),
        description,
        tags,
        assignedTo: existingTicket.assignedTo,
        uId: req.user?._id,
      });

      // Notify the task assignee
      if (existingTicket.assignedTo) {
        await createNotification(
          existingTicket.assignedTo,
          `Your task has been updated by: ${req.user?.name || "Unknown"}`
        );
      }

      // Notify users associated with tags
      if (Array.isArray(tags) && tags.length > 0) {
        const notifications = tags.map((tag) =>
          createNotification(tag, `You are tagged in a task: ${req.user?.name}`)
        );
        await Promise.all(notifications);
      }

      console.log("Task created: ", task);
      res.json({ success: true, message: "Created report successfully" });
    } catch (err) {
      next(err);
    }
  }
);
// in
router.get("/getAllDailyTaskUpdate", authMiddleware, async (req, res, next) => {
  try {
    const tasks = await TaskDaily.find({ uId: req?.user?._id })
      .populate({
        path: "tags",
        select: "_id name",
      })
      .populate({
        path: "uId",
        select: "_id name",
      })
      .populate({
        path: "assignedTo",
        select: "_id name",
      })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tasks,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/getAllTasksCount", authMiddleware, async (req, res, next) => {
  try {
    const [
      totalTasks,
      inCompeleteTask,
      compeletedTask,
      pandingTask,
      testingTask,
      openTask,
    ] = await Promise.all([
      Task.countDocuments({}),
      Task.countDocuments({ status: "in-progress" }),
      Task.countDocuments({ status: "completed" }),
      Task.countDocuments({ status: "pending" }),
      Task.countDocuments({ status: "testing" }),
      Task.countDocuments({ status: "open" }),
    ]);
    const totalNotifications = await Notification.countDocuments({
      userId: req?.user?.id,
      seen: false,
    });

    res.json({
      totalTasks,
      inCompeleteTask,
      compeletedTask,
      pandingTask,
      totalNotifications,
      testingTask,
      openTask,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/getTaskByStatusAndId", async (req, res, next) => {
  try {
    const { status, assignedTo, createdAtDate, ticketNo } = req?.body;

    const query = {};
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    if (ticketNo) query.ticketNo = Number(ticketNo);
    if (createdAtDate) {
      const startOfDay = new Date(createdAtDate);
      const endOfDay = new Date(createdAtDate);
      endOfDay.setHours(23, 59, 59, 999);

      query.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "_id name")
      .populate("createdBy", "_id name")
      .populate("collaborators", "_id name")
      .populate("comments.createdBy", "_id name");

    res.json({ success: true, tasks });
  } catch (error) {
    next(error);
  }
});
// in
router.get("/tickets/filter", authMiddleware, async (req, res, next) => {
  try {
    const { startDate } = req.query;

    if (!startDate) throw new APIError(400, "400", "startDate is required");

    // Parse startDate as a moment object and create a date range for the entire day
    const startOfDay = moment(startDate).startOf("day").toDate();
    const endOfDay = moment(startDate).endOf("day").toDate();

    const tickets = await TaskDaily.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      uId: req?.user?._id,
    })
      .populate("tags", "_id name")
      .populate("uId", "_id name")
      .populate("assignedTo", "_id name");

    res.json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/UpdateTaskDailyUpdate",
  authMiddleware,
  async (req, res, next) => {
    try {
      const { taskId, about, date, description, tags, ticketNo } = req.body;

      const existingTicket = await Task.findOne({ ticketNo });
      if (!existingTicket)
        throw new APIError(404, "404", "Ticket number not found");

      // Find and update the TaskDaily document
      const updatedTask = await TaskDaily.findOneAndUpdate(
        { _id: taskId },
        {
          ticketNo,
          about,
          date: date || new Date(),
          description,
          // assignedTo: existingTicket?._id,
          tags,
          uId: req.user._id,
        },
        { new: true, runValidators: true }
      );

      if (!updatedTask) {
        throw new APIError(
          404,
          "404",
          "TaskDaily record not found for the provided ticket number"
        );
      }

      // Notify the task assignee
      if (existingTicket.assignedTo) {
        await createNotification(
          existingTicket.assignedTo,
          `Your task has been updated by: ${req.user?.name || "Unknown"} 
            Ticket Number ${ticketNo}
            `
        );
      }

      // Notify users associated with tags
      if (Array.isArray(tags) && tags.length > 0) {
        const notifications = tags.map((tag) =>
          createNotification(
            tag,
            `You are tagged in a task: ${req.user?.name}
             Ticket Number ${ticketNo}`
          )
        );
        await Promise.all(notifications);
      }

      res.json({
        success: true,
        message: "TaskDaily updated successfully",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/DeleteTaskDailyUpdate/:id",
  authMiddleware,
  async (req, res, next) => {
    try {
      await TaskDaily.findByIdAndDelete({
        _id: req?.params?.id,
      });

      res.json({
        success: true,
        message: "TaskDaily Deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get Notifications API
router.get("/getAllNotifications", authMiddleware, async (req, res, next) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    // Build query
    // const query = { userId };
    // if (isRead !== undefined) {
    //   query.seen = seen === "true";
    // }

    // Fetch notifications with pagination
    const notifications = await Notification.find({ userId: req.user.id })
      .populate("userId", "name")

      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit));

    // Count total notifications
    const totalNotifications = await Notification.countDocuments({
      userId: req.user.id,
    });

    console.log(":sss ", totalNotifications);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total: totalNotifications,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/updateNotification", async (req, res, next) => {
  try {
    // passs a task id
    const updatedTask = await Notification.findByIdAndUpdate(
      req?.body?._id,

      {
        seen: true,
      },
      {
        new: true,
      }
    );

    res.json({ success: true, message: "Update notification successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
