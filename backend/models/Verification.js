import mongoose from 'mongoose'

const VerificationSchema = new mongoose.Schema({
  npm: { type: String, required: true },
  fotoUrl: { type: String, required: true },
  koordinat: { type: [Number], required: true },
  waktuSwafoto: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  kecamatan: { type: String, required: true },
  kelurahan: { type: String, required: true },
  kota: { type: String, required: true },
  kecamatanSwafoto: { type: String, default: 'Loading...' },
  kelurahanSwafoto: { type: String, default: 'Loading...' },
  kotaSwafoto: { type: String, default: 'Loading...' },
  status: { type: String, default: 'Mengajukan Kembali' },
  keterangan: { type: String, default: '' }, // Menambahkan field keterangan
  createdAt: { type: Date, default: Date.now } // Menambahkan field createdAt
})

const Verification = mongoose.model('Verification', VerificationSchema)
export default Verification
