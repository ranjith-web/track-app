import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  ShoppingCart, 
  TrendingUp, 
  Eye, 
  RefreshCw, 
  Trash2, 
  ExternalLink,
  Calendar,
  DollarSign
} from 'lucide-react'
import { apiService } from '../services/apiService'
import toast from 'react-hot-toast'

const ProductList = () => {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  })

  useEffect(() => {
    fetchProducts()
  }, [pagination.page])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const response = await apiService.getProducts({
        page: pagination.page,
        limit: pagination.limit
      })
      
      setProducts(response.products || [])
      setPagination(response.pagination || pagination)
    } catch (error) {
      console.error('Error fetching products:', error)
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePrice = async (productId) => {
    try {
      setUpdating(productId)
      await apiService.updatePrice(productId)
      toast.success('Price updated successfully!')
      fetchProducts() // Refresh the list
    } catch (error) {
      console.error('Error updating price:', error)
      toast.error('Failed to update price')
    } finally {
      setUpdating(null)
    }
  }

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return
    }

    try {
      await apiService.deleteProduct(productId)
      toast.success('Product deleted successfully!')
      fetchProducts() // Refresh the list
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product')
    }
  }

  const handleTrackClick = async (productId) => {
    try {
      await apiService.trackClick(productId)
      // Don't show toast for click tracking
    } catch (error) {
      console.error('Error tracking click:', error)
    }
  }

  const getLowestPrice = (currentPrice) => {
    if (!currentPrice) return null
    const prices = Object.values(currentPrice).filter(price => price && price > 0)
    return prices.length > 0 ? Math.min(...prices) : null
  }

  const getPriceSources = (currentPrice) => {
    if (!currentPrice) return []
    return Object.entries(currentPrice)
      .filter(([_, price]) => price && price > 0)
      .map(([source, price]) => ({ source, price }))
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="loading"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tracked Products</h1>
          <p className="text-gray-600 mt-1">
            Monitor prices across multiple platforms with AI-powered insights
          </p>
        </div>
        <Link
          to="/add-product"
          className="btn btn-primary"
        >
          <ShoppingCart className="w-5 h-5 mr-2" />
          Add Product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="card text-center py-12">
          <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products Yet</h3>
          <p className="text-gray-600 mb-6">
            Start tracking your favorite products to get price alerts and AI insights.
          </p>
          <Link
            to="/add-product"
            className="btn btn-primary"
          >
            Add Your First Product
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {products.map((product) => {
            const lowestPrice = getLowestPrice(product.currentPrice)
            const priceSources = getPriceSources(product.currentPrice)
            
            return (
              <div key={product._id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start space-x-4 mb-4">
                  {product.image && (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                      {product.name}
                    </h3>
                    {lowestPrice && (
                      <div className="text-2xl font-bold text-green-600">
                        ₹{lowestPrice.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {priceSources.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">Available on:</div>
                    <div className="flex flex-wrap gap-2">
                      {priceSources.map(({ source, price }) => (
                        <span
                          key={source}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {source.charAt(0).toUpperCase() + source.slice(1)}: ₹{price.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <div className="flex items-center">
                    <Eye className="w-4 h-4 mr-1" />
                    {product.clickCount || 0} clicks
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {formatDate(product.lastChecked)}
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Link
                    to={`/products/${product._id}`}
                    onClick={() => handleTrackClick(product._id)}
                    className="btn btn-secondary flex-1 text-center"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    View Details
                  </Link>
                  
                  <button
                    onClick={() => handleUpdatePrice(product._id)}
                    disabled={updating === product._id}
                    className="btn btn-secondary"
                    title="Update Price"
                  >
                    {updating === product._id ? (
                      <div className="loading w-4 h-4"></div>
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                  
                  <button
                    onClick={() => handleDeleteProduct(product._id)}
                    className="btn btn-danger"
                    title="Delete Product"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
            className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <span className="text-gray-600">
            Page {pagination.page} of {pagination.pages}
          </span>
          
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page === pagination.pages}
            className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default ProductList
