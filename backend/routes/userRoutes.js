import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import User from "../models/User.js";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import getAddressFromCoords from "../utils/getAddressFromCoords.js";

dotenv.config();

const router = express.Router();
const { GOOGLE_MAPS_API_KEY } = process.env;

// Rate limiter to prevent abuse
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});

// Endpoint verifikasi pengguna berdasarkan NPM
router.get('/verify/user/:npm', async (req, res) => {
  try {
    const { npm } = req.params;
    const user = await User.findOne({ npm });
    if (!user) {
      // Jika pengguna tidak ditemukan, kembalikan status kosong
      return res.status(200).json({ status: "" });
    }
    // Cek apakah ada pendaftaran pending (Pengajuan Pendaftaran)
    const pendingRegistration = user.registrations.find(reg => reg.status === "Pengajuan Pendaftaran");
    if (pendingRegistration) {
      return res.status(200).json({ status: pendingRegistration.status });
    }
    return res.status(200).json({ status: "" });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Register user with full location details
router.post(
  '/register',
  registerLimiter,
  [
    body("npm").isString().isLength({ min: 10, max: 10 }),
    body("nama").isString().isLength({ min: 3, max: 100 }),
    body("alamat").isString().isLength({ min: 10, max: 200 }),
    body("kecamatan").isString().isLength({ min: 3, max: 100 }),
    body("koordinat").isArray().custom((value) => value.length === 2),
    body("nomorHandphone").isString().isLength({ min: 8, max: 15 }),
    body("nomorKamar").isString().isLength({ min: 1, max: 10 }),
    body("startDate").isISO8601(),
    body("endDate").isISO8601(),
    body("rentangWaktu").isInt({ min: 1 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array()); // Log the validation errors
      return res.status(400).json({ message: "Invalid input", errors: errors.array() });
    }

    console.log("Received payload:", req.body); // Log the received payload

    try {
      const { npm, nama, alamat, kecamatan, koordinat, nomorHandphone, nomorKamar, startDate, endDate, rentangWaktu } = req.body;

      // Use the improved utility function (tries OpenCage first, then Google Maps)
      const addressData = await getAddressFromCoords(koordinat[0], koordinat[1]);

      // Extract the needed data
      const kelurahan = addressData.kelurahan;
      const kota = addressData.kota;

      if (kelurahan === "Gagal mendapatkan kelurahan" || kota === "Gagal mendapatkan kota") {
        return res.status(400).json({ message: "Failed to verify location data" });
      }

      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate); // Gunakan endDate dari frontend

      const user = await User.findOne({ npm });

      if (user) {
        // Hanya blokir jika ada pendaftaran dengan status "Pengajuan Pendaftaran"
        const hasPending = user.registrations.some(reg => reg.status === "Pengajuan Pendaftaran" || reg.status === "Diterima");
        if (hasPending) {
          return res.status(400).json({ message: "Anda sudah memiliki pendaftaran aktif." });
        }

        user.registrations.push({
          tujuan: { alamat, kecamatan, kelurahan, kota, koordinat },
          nomorHandphone,
          nomorKamar,
          rentangWaktu,
          createdAt: new Date(),
          status: "Pengajuan Pendaftaran",
          startDate: new Date(startDate),
          endDate: endDateObj // Gunakan endDateObj
       });
        await user.save();
      } else {
        const newUser = new User({
          npm,
          nama,
          registrations: [{
            tujuan: { alamat, kecamatan, kelurahan, kota, koordinat },
            nomorHandphone,
            nomorKamar,
            rentangWaktu,
            createdAt: new Date(),
            status: "Pengajuan Pendaftaran",
            startDate: new Date(startDate),
            endDate: endDateObj // Gunakan endDateObj
          }]
        });
        await newUser.save();
      }

      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Endpoint lainnya tetap sama...
router.get('/list', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post('/approve/:npm', async (req, res) => {
  try {
    const { npm } = req.params;
    const user = await User.findOne({ npm });
    if (!user) return res.status(404).json({ message: "User not found" });

    const activeRegistration = user.registrations.find(reg => reg.status === "Pengajuan Pendaftaran");
    if (!activeRegistration) return res.status(404).json({ message: "No active registration found" });

    activeRegistration.status = "Diterima";
    activeRegistration.waktuKeberangkatan = new Date();
    await user.save();
    res.json({ message: "User approved successfully" });
  } catch (error) {
    console.error("Error approving user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete('/reject/:npm', async (req, res) => {
  try {
    const { npm } = req.params;
    const user = await User.findOne({ npm });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.registrations = user.registrations.filter(reg => reg.status !== "Pengajuan Pendaftaran");

    if (user.registrations.length === 0) {
      await User.deleteOne({ npm });
      res.json({ message: "User registration rejected and user deleted successfully" });
    } else {
      await user.save();
      res.json({ message: "User registration rejected and deleted successfully" });
    }
  } catch (error) {
    console.error("Error rejecting user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post('/complete/:npm', async (req, res) => {
  try {
    const { npm } = req.params;
    const user = await User.findOne({ npm });
    if (!user) return res.status(404).json({ message: "User not found" });

    const activeRegistration = user.registrations.find(reg => reg.status === "Diterima");
    if (!activeRegistration) return res.status(404).json({ message: "No active registration found" });

    activeRegistration.status = "Selesai";
    activeRegistration.waktuKepulangan = new Date();
    await user.save();
    res.json({ message: "User marked as complete successfully" });
  } catch (error) {
    console.error("Error marking user as complete:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post('/reject-reapply/:npm', async (req, res) => {
  try {
    const { npm } = req.params;
    const user = await User.findOne({ npm });
    if (!user) return res.status(404).json({ message: "User not found" });

    const activeRegistration = user.registrations.find(reg => reg.status === "Mengajukan Kembali");
    if (!activeRegistration) return res.status(404).json({ message: "No active reapply registration found" });

    activeRegistration.status = "Ditolak";
    await user.save();
    res.json({ message: "User reapply rejected successfully" });
  } catch (error) {
    console.error("Error rejecting reapply:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;