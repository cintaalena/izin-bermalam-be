import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function getAddressFromCoords(lat, lng, npm = 'Unknown') {
  // First, try with OpenCage API
  try {
    // Make sure your environment variable is correctly set
    const opencageApiKey = process.env.OPENCAGE_API_KEY || process.env.VITE_OPEN_MAPS_API_KEY;
    const opencageUrl = `https://api.opencagedata.com/geocode/v1/json?key=${opencageApiKey}&q=${lat}%2C+${lng}&pretty=1&no_annotations=1`;

    const opencageResponse = await axios.get(opencageUrl);
    const ocResults = opencageResponse.data.results[0];

    if (ocResults) {
      const ocComponents = ocResults.components || {};

      // Extract location information from OpenCage results
      const jalan = ocComponents.road || ocComponents.street || "Tidak ditemukan";
      const kelurahan = ocComponents.suburb || ocComponents.municipality || ocComponents.village || "Tidak ditemukan";
      const kecamatan = ocComponents.city_district || ocComponents.county || ocComponents.state_district || "Tidak ditemukan";
      const kota = ocComponents.city || ocComponents.town || ocComponents.state || "Tidak ditemukan";

      // Only return if we have sufficient data
      if (kecamatan !== "Tidak ditemukan" || kota !== "Tidak ditemukan") {
        console.log(`Address retrieved from OpenCage for NPM ${npm}:`, { jalan, kelurahan, kecamatan, kota });
        return { jalan, kelurahan, kecamatan, kota };
      }
    }

    // If we get here, OpenCage didn't provide sufficient data
    console.log(`OpenCage data insufficient for NPM ${npm}, falling back to Google Maps`);
    throw new Error("OpenCage data insufficient");

  } catch (opencageError) {
    // Check if it's an auth error
    if (opencageError.response && opencageError.response.status === 401) {
      console.error("OpenCage API authentication error - check your API key");
    } else {
      console.log(`Error or insufficient data from OpenCage for NPM ${npm}, using Google Maps fallback:`, opencageError.message);
    }

    // Fallback to Google Maps API
    try {
      const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=id`;

      const response = await axios.get(googleUrl);
      const results = response.data.results;

      if (results.length > 0) {
        let jalan = "Tidak ditemukan";
        let kelurahan = "Tidak ditemukan";
        let kecamatan = "Tidak ditemukan";
        let kota = "Tidak ditemukan";

        results[0].address_components.forEach((component) => {
          if (component.types.includes("route")) {
            jalan = component.long_name;
          }
          if (component.types.includes("sublocality_level_1") || component.types.includes("locality")) {
            kelurahan = component.long_name;
          }
          if (component.types.includes("administrative_area_level_3")) {
            kecamatan = component.long_name;
          }
          if (component.types.includes("administrative_area_level_2")) {
            kota = component.long_name;
          }
        });

        console.log(`Address retrieved from Google Maps for NPM ${npm}:`, { jalan, kelurahan, kecamatan, kota });
        return { jalan, kelurahan, kecamatan, kota };
      } else {
        return {
          jalan: "Tidak ditemukan",
          kelurahan: "Tidak ditemukan",
          kecamatan: "Tidak ditemukan",
          kota: "Tidak ditemukan"
        };
      }
    } catch (googleError) {
      console.error(`Error fetching address from Google Maps for NPM ${npm}:`, googleError.message);
      return {
        jalan: "Gagal mendapatkan jalan",
        kelurahan: "Gagal mendapatkan kelurahan",
        kecamatan: "Gagal mendapatkan kecamatan",
        kota: "Gagal mendapatkan kota"
      };
    }
  }
}

export default getAddressFromCoords;