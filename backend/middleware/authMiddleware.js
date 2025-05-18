import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'

const { JWT_SECRET } = process.env

const authMiddleware = async (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.admin = await Admin.findById(decoded.id).select('-password')
    next()
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token is not valid or expired' })
  }
}

export default authMiddleware
