import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || (
  import.meta.env.DEV ? 'http://localhost:5000/api' : ''
)

if (!apiBaseUrl) {
  throw new Error('VITE_API_URL must be configured for production')
}
if (import.meta.env.PROD && !apiBaseUrl.startsWith('https://')) {
  throw new Error('VITE_API_URL must use HTTPS in production')
}

const API = axios.create({ baseURL: apiBaseUrl })

// attach token automatically if present
API.interceptors.request.use(config => {
const token = localStorage.getItem('TEACHER_TOKEN')
if (token) config.headers.Authorization = `Bearer ${token}`
return config
})

export default API