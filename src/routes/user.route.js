import express from "express";
import { fileParser } from "../middleware/file.handler.js";
import {
  signUpUser,
  updateUser,
  verifyOtp,
  userDetail,
  addFunds,
  loginWithGoogle,
  profileNameUpdate,
  loginWithWalletConnect,
  pushNotification,
  checkAndSendOtp,
  otpVerifyEmailAndMobNo,
} from "../services/user.service.js";
import jwt from "jsonwebtoken";
import config from "../../config.js";
import {
  createContactUs,
  updateUserProfile,
  changePassword,
} from "../controllers/users/user.controller.js";
import { User } from "../models/user.js";
import { createEmailTransporter } from "../services/helper.js";
import pk from "rest-api-errors";
const { APIError } = pk;
import { forgetPasswordTemplate } from "../emailTemplates/forgetPassword.template.js";
import { otpEmailTemplate } from "../emailTemplates/otpEmail.template.js";
import { authMiddleware, getToken } from "../middleware/checkAuth.js";
import { getOtp, generatePromoCode } from "../utils/helper.js";
import { upload } from "../services/s3.service.js";
import { Setting } from "../models/setting.js";
import { Permission } from "../models/permission.js";
import { Country } from "../models/country.js";
import { getTimezoneByCountry } from "country-timezone-list";

const router = express();

router.post("/signUp", async (req, res, next) => {
  try {
    let data = "";
    const user = await User.findOne({ email: req?.body?.email });
    if (user) throw new APIError(403, "403", "User is already created");
    data = await signUpUser(req.body);
    if (!data) throw new APIError(403, "403", "User not register");
    const token = getToken(
      data._id,
      data?.email,
      data?.rememberMe ? req?.body?.rememberMe : false
    );
    data.save();
    res.json({
      success: true,
      token,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/update", fileParser, async (req, res, next) => {
  try {
    const files = req.files;
    // const data = await upload(file, `documents/${vehicleReg}`, type);
    const data = await updateUser(req.body, files);
    if (data) {
      res.json({
        success: true,
        data,
      });
    }
    res.json({
      success: false,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/verifyOtp", async (req, res, next) => {
  try {
    const data = await verifyOtp(req.body);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/addUserBalance", async (req, res, next) => {
  try {
    const data = await UserBalance.create(req.body);

    return res.json({
      success: true,
      message: "Add UserBalance successfully",
      data,
    });
  } catch {}
});

router.get("/userDetail", async (req, res, next) => {
  try {
    const data = await userDetail(req);
    if (data) {
      return res.json({
        success: true,
        data,
      });
    }
    res.json({
      success: false,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/contactUs", createContactUs);

//router.post("/waitList", createWaitlist);

router.post("/waitList", async (req, res, next) => {
  try {
    const data = await WaitList.create(req.body);
    if (data) {
      // const otp = getOtp();
      // data.otp = otp;
      // data.save();

      let emailTransporter = await createEmailTransporter();

      let emailOptions = {
        subject: "Welcome to BHAI Finance!",
        to: data.email,
        from: process.env.BHAIPAY_EMAIL,
        html: otpEmailTemplate(req.body.name, data._id),
      };
      const response = await emailTransporter.sendMail(emailOptions);

      if (!response) {
        throw new APIError(422, "422", "Email sending failed.");
      }

      res.json({
        success: true,
        data,
      });
    }
  } catch (error) {
    next(error);
  }
});

router.get("/getWaitList", authMiddleware, async (req, res, next) => {
  try {
    const data = await WaitList.find({});
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/getAdminCount", authMiddleware, async (req, res, next) => {
  try {
    const totalWaitList = await WaitList.countDocuments({});
    const totalUsers = await User.countDocuments({});

    res.json({
      success: true,
      totalWaitList,
      totalUsers,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/getPermission", async (req, res, next) => {
  try {
    const data = await Permission.find({});
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/verifyWaitListEmail/:_id", async (req, res, next) => {
  try {
    const _id = req.params._id;
    const data = await WaitList.findById(_id);
    if (!data) {
      res.send("Invalid link.");
    } else {
      data.isEmailVerified = true;
      data.save();

      res.send("Email verified successful.");
    }
  } catch (error) {
    next(error);
  }
});

router.post(
  "/updateProfile",
  authMiddleware,
  fileParser,
  async (req, res, next) => {
    try {
      const path = await upload(
        req.files[0].buffer,
        `profile/${req.user?.email}/${Date.now()}.png`
      );
      const data = await updateUserProfile(
        `${process.env.AWS_S3_URL}${path}`,
        req.user?._id
      );
      res.json({
        data,
        success: true,
        message: "Profile update successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/send-otp", async (req, res, next) => {
  try {
    const { email } = req.body;
    let user = "";
    user = await User.findOne({ email });

    if (!user) {
      throw new APIError(400, "400", "Email doesn't exist");
    }

    const otp = getOtp();
    const updateUser = await User.findOneAndUpdate({ _id: user._id }, { otp });
    if (!updateUser) {
      throw new APIError(400, "400", "User update failed.");
    }
    let emailTransporter = await createEmailTransporter();

    let emailOptions = {
      subject: "Forgot Password",
      to: email,
      from: process.env.BHAIPAY_EMAIL,

      html: forgetPasswordTemplate(otp, req.hostname),
    };
    const response = await emailTransporter.sendMail(emailOptions);

    if (!response) {
      throw new APIError(422, "422", "Email sending failed.");
    }

    res.json({
      email,
      success: true,
      message: "OTP sent to email.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/update-password", async (req, res, next) => {
  try {
    const { password, newPassword, email } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      throw new APIError("400", 400, "User doesn't exist.");
    }

    if (password) {
      const match = await user.comparePassword(password, user.password);
      if (!match) {
        throw new APIError("400", 422, "Invalid credentials.");
      }
      user.password = newPassword;
      await user.save();
    } else {
      throw new APIError("400", 422, "Invalid request.");
    }

    res.json({
      success: true,
      message: "Password update successfully.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { newPassword, email } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      throw new APIError("400", 400, "User doesn't exist.");
    }

    if (!newPassword) {
      throw new APIError("422", 422, "Enter new password.");
    }

    user.password = newPassword;

    await user.save();

    res.json({
      success: true,
      message: "Password has been updated successfully.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/addFunds", authMiddleware, async (req, res, next) => {
  try {
    if (!req.user?._id) throw new APIError("User ID not found from token!");

    const data = await addFunds(req.body, req.user?._id);
    res.json({
      success: true,
      message: "Transaction created successfully.",
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/loginWith/:provider", async (req, res, next) => {
  try {
    const provider = req?.params?.provider;

    switch (provider) {
      case "google":
        const user = await loginWithGoogle(req?.body?.email, req?.body);
        const token = getToken(user?._id, req?.body?.email, true);

        res.json({
          success: true,
          message: "Login successful.",
          token,
        });
        break;

      default:
        throw new APIError(422, "422", "Login provider not recognized.");
    }
  } catch (error) {
    next(error);
  }
});

router.get("/verifyWaitListOtp/:otp", async (req, res, next) => {
  try {
    const data = await WaitList.findOne({ otp: req.params.otp });
    if (!data) {
      throw new APIError(422, "422", "Invalid OTP.");
    }
    data.isEmailVerified = true;
    data.save();

    res.json({
      success: true,
      message: "OTP verified successful.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/profileNameUpdate", authMiddleware, async (req, res, next) => {
  try {
    await profileNameUpdate(
      req?.body?.name,
      req?.body?.countryId,
      req?.user?._id
    );

    res.json({
      success: true,
      message: "Profile updated successfully.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/sendOtpEmailAnMobNo", authMiddleware, async (req, res, next) => {
  try {
    res.json({
      message: await checkAndSendOtp(
        req?.user?._id,
        req?.body?.email,
        req?.body?.mobNo,
        req?.body?.countryCode
      ),
      success: true,
    });
  } catch (error) {
    next(error);
  }
});
router.post("/changePassword", authMiddleware, changePassword);

router.post(
  "/verifyOtpEmailAnMobNo",
  authMiddleware,
  async (req, res, next) => {
    try {
      const { emailOtp, email, mobNo, mobNoOtp, countryCode, countryId } =
        req.body;

      const message = await otpVerifyEmailAndMobNo(
        email,
        mobNo,
        req?.user?._id,
        emailOtp,
        mobNoOtp,
        countryCode,
        countryId
      );

      res.json({
        success: true,
        message,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/setting", authMiddleware, async (req, res, next) => {
  try {
    res.json({
      data: await Setting.findOne({}),
      success: true,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/loginWalletConnect", async (req, res, next) => {
  try {
    const user = await loginWithWalletConnect(req?.body);

    if (!user) {
      throw new APIError(422, "422", "Login provider not recognized.");
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/signUpWalletConnect", async (req, res, next) => {
  try {
    let user = await User.findOne({ _id: req?.body?.userId });
    if (!user) {
      throw new APIError(404, "404", "User not found");
    }

    if (user.email === req?.body?.email) {
      throw new APIError(
        404,
        "404",
        "Already have an account with this email!"
      );
    }

    const promoCode = await generatePromoCode();

    const card = await Card.create({
      amount: 0,
      currencyCode: "USD",
      currencySign: "$",
      status: "not asign",
      last4: 0,
      userId: user?._id,
    });
    user.cardId = card._id;
    user.promoCode = promoCode;
    user.email = req?.body?.email;
    user.mobNo = req?.body?.mobNo;
    user.countryCode = req?.body?.countryCode;
    user.password = req?.body?.password;

    const token = getToken(user?._id, req?.body?.email, true);
    await user.save();

    res.json({
      success: true,
      message: "Login successfully",
      token,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/getCountries", async (req, res, next) => {
  try {
    let data = await Country.find().lean();
    data.map((d) => {
      d.icon = `${
        process.env.ICONS_S3_URL
      }flag/png100/${d?.alpha2.toLowerCase()}.png`;
      d.timeZone = getTimezoneByCountry(d?.alpha2)?.[0]?.offset || "-";
      return d;
    });
    res.statusCode = 200;
    res.json({
      data,
      success: true,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/pushNotification", async (req, res, next) => {
  try {
    await pushNotification(
      req?.body?.notificationToken,
      req?.body?.notificationTitle,
      req?.body?.notificationBody
    );

    res.json({
      success: true,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/getAllUser", authMiddleware, async (req, res, next) => {
  try {
    let data = await User.find({});

    for (const d of data) delete d.password;

    res.json({
      success: true,
      users: data,
    });
  } catch (error) {
    next(error);
  }
});

// Get all products
// router.get("/products", async (req, res, next) => {
//   try {
//     const products = await Product.find();
//     res.json(products);
//   } catch (error) {
//     next(error);
//   }
// });

// Add item to cart
// router.post("/cart/add", async (req, res, next) => {
//   try {
//     const { productId, quantity, email } = req.body;
//     const user = await User.findOne({ email });

//     const product = await Product.findById(productId);

//     if (!product) {
//       return res.status(404).json({ error: "Product not found" });
//     }

//     let cart = await Cart.findOne(); // Assuming there is only one cart for simplicity

//     if (!cart) {
//       cart = new Cart({
//         items: [],
//       });
//     }

//     const cartItemIndex = cart.items.findIndex((item) =>
//       item.product.equals(productId)
//     );

//     if (cartItemIndex !== -1) {
//       // If the product is already in the cart, update the quantity
//       cart.items[cartItemIndex].quantity += quantity;
//     } else {
//       // If the product is not in the cart, add a new item
//       cart.items.push({ product: productId, quantity });
//     }

//     if (cart?._id) user.cartId = cart?._id;

//     await cart.save();
//     res.json(cart);
//   } catch (error) {
//     next(error);
//   }
// });

// Get cart items
// router.get("/cart", async (req, res, next) => {
//   try {
//     const cart = await Cart.findOne().populate("items.product", "name price");

//     if (!cart) {
//       return res.json({ items: [] });
//     }

//     res.json(cart.items);
//   } catch (error) {
//     next(error);
//   }
// });

export default router;
