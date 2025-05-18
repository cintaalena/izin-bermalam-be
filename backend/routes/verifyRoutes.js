import express from 'express'
import multer from 'multer'
import Verification from '../models/Verification.js'
import User from '../models/User.js'
import getAddressFromCoords from '../utils/getAddressFromCoords.js'
import rateLimit from 'express-rate-limit'
import { body, param, validationResult } from 'express-validator'

const router = express.Router()

// Add this helper function near the top of the file

function locationMatches (registeredLocation, detectedLocation) {
  // Normalize location strings
  const normalizeString = (str) => {
    if (!str || str === 'Tidak ditemukan') return ''
    return str.toLowerCase()
      .replace(/kecamatan\s*/i, '')
      .replace(/kabupaten\s*/i, '')
      .replace(/kota\s*/i, '')
      .replace(/,.*$/, '')
      .trim()
  }

  // Extract city/regency names
  const registeredCity = normalizeString(registeredLocation.kota)
  const detectedCity = normalizeString(detectedLocation.kotaSwafoto)

  // If city names match, consider it a match
  if (registeredCity && detectedCity &&
     (registeredCity.includes(detectedCity) || detectedCity.includes(registeredCity))) {
    return true
  }

  // Also check if kecamatan matches as a fallback
  const registeredKecamatan = normalizeString(registeredLocation.kecamatan)
  const detectedKecamatan = normalizeString(detectedLocation.kecamatanSwafoto)

  if (registeredKecamatan && detectedKecamatan &&
     (registeredKecamatan.includes(detectedKecamatan) || detectedKecamatan.includes(registeredKecamatan))) {
    return true
  }

  return false
}

// Fungsi untuk memfilter hanya file gambar
const fileFilter = (req, file, cb) => {
  // Daftar format gambar yang diizinkan
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']

  if (allowedTypes.includes(file.mimetype)) {
    // Jika tipe file adalah gambar, lanjutkan
    cb(null, true)
  } else {
    // Jika bukan gambar, tolak file dengan pesan error
    cb(new Error('Hanya gambar yang diperbolehkan'), false)
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter // Menambahkan fileFilter untuk validasi tipe file
})

// Rate limiter to prevent abuse
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
})

router.post(
  '/upload/:npm',
  uploadLimiter,
  upload.single('swafoto'),
  [
    param('npm').isString().isLength({ min: 10, max: 10 }),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
    body('keterangan').optional().isString().isLength({ min: 0, max: 500 })
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array())
      return res.status(400).json({ message: 'Invalid input', errors: errors.array() })
    }

    const { npm } = req.params
    const { lat, lng, keterangan } = req.body

    try {
      const user = await User.findOne({ npm })
      if (!user) {
        console.error('User not found:', npm)
        return res.status(404).json({ message: 'User not found' })
      }

      // Check if the user's status allows for swafoto submission
      const activeRegistration = user.registrations.find(reg => reg.status === 'Diterima')
      if (!activeRegistration) {
        console.error('User status does not allow swafoto submission:', npm)
        return res.status(400).json({ message: 'User status does not allow swafoto submission' })
      }

      const startDate = new Date(activeRegistration.startDate)
      const endDate = new Date(activeRegistration.endDate)
      console.log('startDate:', startDate)
      console.log('endDate:', endDate)

      // Determine time zone based on user's longitude
      const longitude = parseFloat(lng)
      let timeZoneOffset = 7 // Default to WIB (UTC+7)
      let timeZoneName = 'WIB'

      if (longitude >= 115 && longitude < 130) {
        timeZoneOffset = 8 // WITA (UTC+8)
        timeZoneName = 'WITA'
      } else if (longitude >= 130) {
        timeZoneOffset = 9 // WIT (UTC+9)
        timeZoneName = 'WIT'
      }

      console.log(`User location is in ${timeZoneName} (UTC+${timeZoneOffset})`)

      // Get current UTC time
      const utcNow = new Date()

      // Calculate WIB time (always UTC+7) regardless of user's location
      const wibHour = (utcNow.getUTCHours() + 7) % 24

      // Adjust date for WIB if needed
      const wibDate = new Date(utcNow)
      if (utcNow.getUTCHours() + 7 >= 24) {
        wibDate.setDate(wibDate.getDate() + 1)
      }
      const wibDateString = wibDate.toISOString().split('T')[0]

      // Calculate user's local hour for display purposes only
      const userLocalHour = (utcNow.getUTCHours() + timeZoneOffset) % 24
      const userLocalDate = new Date(utcNow)
      if (utcNow.getUTCHours() + timeZoneOffset >= 24) {
        userLocalDate.setDate(userLocalDate.getDate() + 1)
      }

      console.log(`WIB time: ${wibHour}:00, User's local time: ${userLocalHour}:00 ${timeZoneName}`)

      let isValidTime = false

      // Validate based on WIB time, not local time
      if (wibDateString === startDate.toISOString().split('T')[0] && wibHour >= 18 && wibHour < 23) {
        // Start date, only allow evening (6 PM to 11 PM) in WIB
        isValidTime = true
        console.log('Valid time: Start date evening (WIB reference)')
      } else if (wibDateString === endDate.toISOString().split('T')[0] && wibHour >= 6 && wibHour < 12) {
        // End date, only allow morning (6 AM to 12 PM) in WIB
        isValidTime = true
        console.log('Valid time: End date morning (WIB reference)')
      } else if (wibDate >= startDate && wibDate <= endDate) {
        // Termasuk hari terakhir sebagai hari yang valid
        if ((wibHour >= 6 && wibHour < 12) || (wibHour >= 18 && wibHour < 23)) {
          isValidTime = true
        }
      }

      if (!isValidTime) {
        // Convert WIB time windows to user's local time for error message
        const localMorningStart = (6 + (timeZoneOffset - 7)) % 24
        const localMorningEnd = (12 + (timeZoneOffset - 7)) % 24
        const localEveningStart = (18 + (timeZoneOffset - 7)) % 24
        const localEveningEnd = (23 + (timeZoneOffset - 7)) % 24

        // Handle day boundary crossings for display
        const morningWindow = `${localMorningStart}:00-${localMorningEnd}:00`
        let eveningWindow = `${localEveningStart}:00-${localEveningEnd}:00`
        if (localEveningEnd < localEveningStart) {
          eveningWindow = `${localEveningStart}:00-${localEveningEnd + 24}:00`
        }

        console.error(`Invalid swafoto time for ${timeZoneName}: ${userLocalHour}:00`)
        return res.status(400).json({
          message: `Swafoto hanya diperbolehkan pada waktu yang ditentukan (${morningWindow} atau ${eveningWindow} ${timeZoneName}).`
        })
      }

      // Check if swafoto has already been taken twice today for the active registration
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const swafotoToday = await Verification.find({ npm, createdAt: { $gte: today }, status: 'Diterima' })
      if (swafotoToday.length >= 2) {
        console.error('Swafoto has already been taken twice today:', npm)
        return res.status(400).json({ message: 'Swafoto has already been taken twice today' })
      }

      // Check if the number of swafotos has reached the limit for the time range
      if (activeRegistration.swafotoCount >= activeRegistration.rentangWaktu * 2) {
        console.error('Swafoto has reached the limit for the time range:', npm)
        return res.status(400).json({ message: 'Swafoto has reached the limit for the time range' })
      }

      // Add NPM to address retrieval logs
      console.log(`Processing location for NPM: ${npm}`)

      const { kelurahan: kelurahanSwafoto, kecamatan: kecamatanSwafoto, kota: kotaSwafoto } =
        await getAddressFromCoords(lat, lng, npm)

      // Log the address with NPM
      console.log(`Address for NPM ${npm}:`, {
        kelurahan: kelurahanSwafoto,
        kecamatan: kecamatanSwafoto,
        kota: kotaSwafoto
      })

      const verification = new Verification({
        npm,
        fotoUrl: `/uploads/${req.file.filename}`,
        koordinat: [lat, lng],
        kecamatan: activeRegistration.tujuan.kecamatan,
        kelurahan: activeRegistration.tujuan.kelurahan,
        kota: activeRegistration.tujuan.kota,
        kecamatanSwafoto,
        kelurahanSwafoto,
        kotaSwafoto,
        keterangan: keterangan || '', // Set keterangan to empty string if not provided
        createdAt: new Date()
      })

      await verification.save()
      activeRegistration.swafotoCount += 1
      await user.save()
      res.status(201).json({ message: 'Swafoto uploaded successfully' })
    } catch (error) {
      console.error('Error uploading swafoto:', error)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

router.get('/list', async (req, res) => {
  try {
    const verifications = await Verification.find()
    res.json(verifications)
  } catch (error) {
    console.error('Error fetching verifications:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/user/:npm', [
  param('npm').isString().isLength({ min: 10, max: 10 })
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    console.error('Validation errors:', errors.array())
    return res.status(400).json({ message: 'NPM must be exactly 10 digits' })
  }

  try {
    const { npm } = req.params
    const user = await User.findOne({ npm })
    if (!user) {
      console.error('User not found:', npm)
      return res.status(404).json({ message: 'User not found' })
    }

    const activeRegistration = user.registrations.find(reg => reg.status === 'Diterima')
    if (!activeRegistration) {
      console.error('No active registration found:', npm)
      return res.status(404).json({ message: 'No active registration found' })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const swafotoToday = await Verification.find({ npm, createdAt: { $gte: today }, status: 'Diterima' })

    res.json({
      rentangWaktu: activeRegistration.rentangWaktu,
      swafotoCount: activeRegistration.swafotoCount,
      swafotoTakenToday: swafotoToday.length,
      status: activeRegistration.status,
      tujuan: activeRegistration.tujuan,
      startDate: activeRegistration.startDate,
      endDate: activeRegistration.endDate
    })
  } catch (error) {
    console.error('Error fetching user details:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/approve/:npm', [
  param('npm').isString().isLength({ min: 10, max: 10 })
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    console.error('Validation errors:', errors.array())
    return res.status(400).json({ message: 'NPM must be exactly 10 digits' })
  }

  try {
    const { npm } = req.params
    const user = await User.findOne({ npm })
    if (!user) {
      console.error('User not found:', npm)
      return res.status(404).json({ message: 'User not found' })
    }

    const activeRegistration = user.registrations.find(reg => reg.status === 'Pengajuan Pendaftaran')
    if (!activeRegistration) {
      console.error('No active registration found:', npm)
      return res.status(404).json({ message: 'No active registration found' })
    }

    activeRegistration.status = 'Diterima'
    await user.save()
    res.json({ message: 'User approved successfully' })
  } catch (error) {
    console.error('Error approving user:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/reject/:npm', [
  param('npm').isString().isLength({ min: 10, max: 10 })
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    console.error('Validation errors:', errors.array())
    return res.status(400).json({ message: 'NPM must be exactly 10 digits' })
  }

  try {
    const { npm } = req.params
    const user = await User.findOne({ npm })
    if (!user) {
      console.error('User not found:', npm)
      return res.status(404).json({ message: 'User not found' })
    }

    const activeRegistration = user.registrations.find(reg => reg.status === 'Pengajuan Pendaftaran')
    if (!activeRegistration) {
      console.error('No active registration found:', npm)
      return res.status(404).json({ message: 'No active registration found' })
    }

    activeRegistration.status = 'Ditolak'
    await user.save()
    res.json({ message: 'User rejected successfully' })
  } catch (error) {
    console.error('Error rejecting user:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Agrega este endpoint después de las otras rutas

// Update the swafoto-status endpoint

router.get('/swafoto-status/:npm', [
  param('npm').isString().isLength({ min: 10, max: 10 })
], async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'NPM must be exactly 10 digits' })
  }

  try {
    const { npm } = req.params
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Buscar verificaciones del día actual
    const todayVerifications = await Verification.find({
      npm,
      createdAt: { $gte: today }
    })

    // Inicializar el estado de swafoto
    const status = { pagi: false, sore: false }

    // Verificar cada swafoto - convert to WIB time for checking
    todayVerifications.forEach(verification => {
      const verificationTime = new Date(verification.createdAt)
      // Calculate WIB hour by adjusting UTC time
      const wibHour = (verificationTime.getUTCHours() + 7) % 24

      if (wibHour >= 6 && wibHour < 12) {
        status.pagi = true
      } else if (wibHour >= 18 && wibHour < 23) {
        status.sore = true
      }
    })

    // Devolver el estado de swafoto para el día actual
    res.json(status)
  } catch (error) {
    console.error('Error checking swafoto status:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Add this route after your existing routes

router.get('/missing-swafoto', async (req, res) => {
  try {
    const currentDate = new Date()
    // Calculate current WIB hour regardless of server time zone
    const wibHour = (currentDate.getUTCHours() + 7) % 24

    // Determine current session based on WIB time
    let session = null
    if (wibHour >= 6 && wibHour < 12) {
      session = 'pagi'
    } else if (wibHour >= 18 && wibHour < 23) {
      session = 'sore'
    } else {
      return res.status(400).json({
        message: 'Tidak ada sesi swafoto saat ini. Sesi pagi WIB: 06:00-12:00, Sesi sore WIB: 18:00-23:00'
      })
    }

    // Set start of today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Find all users with active registrations
    const activeUsers = await User.find({
      registrations: {
        $elemMatch: {
          status: 'Diterima',
          startDate: { $lte: currentDate },
          endDate: { $gte: currentDate }
        }
      }
    })

    // For each active user, check if they've taken swafoto in current session
    const missingSwafotoUsers = []

    for (const user of activeUsers) {
      const activeRegistration = user.registrations.find(reg =>
        reg.status === 'Diterima' &&
        new Date(reg.startDate) <= currentDate &&
        new Date(reg.endDate) >= currentDate
      )

      if (!activeRegistration) continue

      // Skip if first day evening session and current time is morning
      const isFirstDay = new Date(activeRegistration.startDate).toISOString().split('T')[0] === currentDate.toISOString().split('T')[0]
      if (isFirstDay && session === 'pagi') continue

      // Skip if last day morning session and current time is evening
      const isLastDay = new Date(activeRegistration.endDate).toISOString().split('T')[0] === currentDate.toISOString().split('T')[0]
      if (isLastDay && session === 'sore') continue

      // Find swafoto taken by this user today in the current session
      const todayVerifications = await Verification.find({
        npm: user.npm,
        createdAt: { $gte: today }
      })

      // Check if user has already taken swafoto in current session
      const hasTakenSwafoto = todayVerifications.some(verification => {
        const verificationTime = new Date(verification.createdAt)
        const wibHour = (verificationTime.getUTCHours() + 7) % 24

        if (session === 'pagi') {
          return wibHour >= 6 && wibHour < 12
        } else { // session === "sore"
          return wibHour >= 18 && wibHour < 23
        }
      })

      if (!hasTakenSwafoto) {
        missingSwafotoUsers.push({
          npm: user.npm,
          nama: user.nama
          // session: session,
        })
      }
    }

    res.json({
      tanggal: currentDate.toISOString().split('T')[0],
      sesi: session,
      jumlahBelumSwafoto: missingSwafotoUsers.length,
      DaftarOrang: missingSwafotoUsers
    })
  } catch (error) {
    console.error('Error fetching missing swafoto users:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
