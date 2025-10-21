import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Link as LinkIcon, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import { apiService } from '../services/apiService'
import toast from 'react-hot-toast'

const AddProduct = () => {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [platform, setPlatform] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!url.trim()) {
      toast.error('Please enter a product URL')
      return
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      toast.error('Please enter a valid URL')
      return
    }

    // Check if URL is from supported platforms
    const detectedPlatform = apiService.getPlatformFromUrl(url)
    if (detectedPlatform === 'unknown') {
      toast.error('Please enter a URL from Amazon, Flipkart, or Myntra')
      return
    }

    setLoading(true)
    try {
      const response = await apiService.addProduct({ url })
      
      if (response.message === 'Product already being tracked') {
        toast.error('This product is already being tracked')
        navigate(`/products/${response.product._id}`)
        return
      }

      toast.success('Product added successfully!')
      navigate(`/products/${response.product._id}`)
    } catch (error) {
      console.error('Error adding product:', error)
      const errorMessage = error.response?.data?.error || 'Failed to add product'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleUrlChange = (e) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    
    if (newUrl) {
      const detectedPlatform = apiService.getPlatformFromUrl(newUrl)
      setPlatform(detectedPlatform)
    } else {
      setPlatform('')
    }
  }

  const exampleUrls = [
    {
      platform: 'Amazon',
      url: 'https://www.amazon.in/dp/B08N5WRWNW',
      color: 'bg-orange-100 text-orange-800'
    },
    {
      platform: 'Flipkart',
      url: 'https://www.flipkart.com/samsung-galaxy-s21-fe-5g/p/itm...',
      color: 'bg-blue-100 text-blue-800'
    },
    {
      platform: 'Myntra',
      url: 'https://www.myntra.com/shirts/roadster/roadster-men-navy-blue-solid-casual-shirt/1702222/buy',
      color: 'bg-pink-100 text-pink-800'
    }
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Add New Product</h1>
          <p className="text-gray-600">
            Track prices across Amazon, Flipkart, and Myntra with AI-powered analysis
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              Product URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="url"
                id="url"
                value={url}
                onChange={handleUrlChange}
                placeholder="https://www.amazon.in/dp/..."
                className="input pl-10"
                disabled={loading}
                required
              />
            </div>
            {platform && platform !== 'unknown' && (
              <div className="mt-2 flex items-center text-sm text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                Detected: {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-blue-800 mb-1">Supported Platforms</h3>
                <p className="text-sm text-blue-700">
                  We currently support product URLs from Amazon, Flipkart, and Myntra. 
                  Make sure the URL is a direct link to a product page.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="btn btn-primary w-full text-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Adding Product...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5 mr-2" />
                Add Product
              </>
            )}
          </button>
        </form>

        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Example URLs</h3>
          <div className="space-y-3">
            {exampleUrls.map((example, index) => (
              <div key={index} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${example.color}`}>
                      {example.platform}
                    </span>
                    <p className="text-sm text-gray-600 mt-1 font-mono">
                      {example.url}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUrl(example.url)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Use
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">What happens next?</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• We'll extract product information and current price</li>
            <li>• AI will analyze price trends and provide predictions</li>
            <li>• You'll get notifications when prices drop</li>
            <li>• Track price history for the last 3 months</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default AddProduct
