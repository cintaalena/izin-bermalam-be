import mongoose from 'mongoose'

const RegistrationSchema = new mongoose.Schema({
  tujuan: {
    alamat: String,
    kecamatan: String,
    kelurahan: String,
    kota: String,
    koordinat: [Number]
  },
  nomorHandphone: { type: String, required: true },
  nomorKamar: { type: String, required: true },
  rentangWaktu: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: 'Pengajuan Pendaftaran' },
  startDate: { type: Date },
  endDate: { type: Date },
  swafotoCount: { type: Number, default: 0 }
})

const UserSchema = new mongoose.Schema({
  npm: { type: String, required: true, unique: true },
  nama: { type: String, required: true },
  registrations: [RegistrationSchema]
})

const User = mongoose.model('User', UserSchema)
export default User
