import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'
import rateLimit from 'express-rate-limit'
import { body, validationResult } from 'express-validator'
import authMiddleware from '../middleware/authMiddleware.js'

const router = express.Router()
const { JWT_SECRET } = process.env

// Rate limiter to prevent brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
})

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '1h' })
}

router.post(
  '/login',
  loginLimiter,
  [
    body('username').isString().isLength({ min: 3, max: 50 }),
    body('password').isString().isLength({ min: 8, max: 100 })
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid input' })
    }

    const { username, password } = req.body

    try {
      const admin = await Admin.findOne({ username })
      if (!admin) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' })
      }

      const isMatch = await bcrypt.compare(password, admin.password)
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' })
      }

      // Generate a token (e.g., JWT) for session management
      const token = generateToken(admin._id)

      // Set cookie with the token
      res.cookie('token', token, {
        httpOnly: true
      })

      res.json({ success: true, role: 'admin', token })
    } catch (error) {
      console.error('Error logging in:', error)
      res.status(500).json({ success: false, message: 'Server error' })
    }
  }
)

router.get('/protected-route', authMiddleware, (req, res) => {
  res.json({ success: true, message: 'You have access to this protected route' })
})

export default router
