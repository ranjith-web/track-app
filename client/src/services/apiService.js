import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`Making ${config.method?.toUpperCase()} request to ${config.url}`)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export const apiService = {
  // Product endpoints
  async getProducts(params = {}) {
    const response = await api.get('/prices/products', { params })
    return response.data
  },

  async getProduct(productId) {
    const response = await api.get(`/products/${productId}`)
    return response.data
  },

  async addProduct(productData) {
    const response = await api.post('/prices/track', productData)
    return response.data
  },

  async updateProduct(productId, productData) {
    const response = await api.put(`/products/${productId}`, productData)
    return response.data
  },

  async deleteProduct(productId) {
    const response = await api.delete(`/products/${productId}`)
    return response.data
  },

  // Price endpoints
  async getCurrentPrice(productId) {
    const response = await api.get(`/prices/current/${productId}`)
    return response.data
  },

  async updatePrice(productId) {
    const response = await api.post(`/prices/update/${productId}`)
    return response.data
  },

  async getPriceHistory(productId, months = 3) {
    const response = await api.get(`/prices/history/${productId}?months=${months}`)
    return response.data
  },

  async trackClick(productId) {
    const response = await api.post(`/prices/click/${productId}`)
    return response.data
  },

  // AI endpoints
  async analyzePrice(productId) {
    const response = await api.post(`/ai/analyze/${productId}`)
    return response.data
  },

  async getInsights(productId) {
    const response = await api.get(`/ai/insights/${productId}`)
    return response.data
  },

  async getRecommendations(productId) {
    const response = await api.get(`/ai/recommendations/${productId}`)
    return response.data
  },

  async generateAlert(productId, targetPrice) {
    const response = await api.post(`/ai/alert/${productId}`, { targetPrice })
    return response.data
  },

  // Utility functions
  async healthCheck() {
    const response = await api.get('/health')
    return response.data
  },

  // Helper function to extract platform from URL
  getPlatformFromUrl(url) {
    if (url.includes('amazon.')) return 'amazon'
    if (url.includes('flipkart.')) return 'flipkart'
    if (url.includes('myntra.')) return 'myntra'
    return 'unknown'
  },

  // Helper function to format price
  formatPrice(price) {
    if (!price) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  },

  // Helper function to format date
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}

export default apiService
