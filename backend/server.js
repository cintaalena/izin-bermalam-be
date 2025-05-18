import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import verifyRoutes from "./routes/verifyRoutes.js";
import adminRoutes from "./routes/adminRoutes.js"; // Import admin routes
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Admin from "./models/Admin.js"; // Import Admin model
import https from 'https'; // Import https module
import fs from 'fs'; // Import fs module for reading files
import cookieParser from "cookie-parser"; // Import cookie-parser

dotenv.config();
connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Update your CORS configuration
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // For development only
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// Keep your existing cors middleware after these headers
app.use(cors({
  origin: ["https://localhost:5173", "https://157.66.34.25:5173"], // Tambahkan domain frontend Anda
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"], // Pastikan header yang diperlukan diizinkan
  credentials: true // Jika Anda menggunakan cookie untuk autentikasi
}));
app.use(express.json());
app.use(cookieParser()); // Use cookie-parser

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("API Running...");
});

app.use("/users", userRoutes);
app.use("/verify", verifyRoutes);
app.use("/admin", adminRoutes); // Use admin routes

// Seed the admin user
const seedAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: "admin" });
    if (adminExists) {
      console.log("Admin user already exists");
    } else {
      const admin = new Admin({
        username: "!AdminKit4Bers4m4!",
        password: "#Menj4diB4ik#", // Change this to a secure password
      });

      await admin.save();
      console.log("Admin user created");
    }
  } catch (error) {
    console.error("Error seeding admin user:", error);
  }
};

seedAdmin();

// HTTPS Configuration
const privateKey = fs.readFileSync(path.join(__dirname, 'server.key'), 'utf8');
const certificate = fs.readFileSync(path.join(__dirname, 'server.crt'), 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Start HTTPS server
const PORT = process.env.PORT || 5000;
https.createServer(credentials, app).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on https://localhost:${PORT}`);
});
