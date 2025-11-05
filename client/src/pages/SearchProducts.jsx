import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ShoppingBag, TrendingDown, ExternalLink, Loader2, Plus } from 'lucide-react'
import { apiService } from '../services/apiService'
import toast from 'react-hot-toast'

const SearchProducts = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [addingUrl, setAddingUrl] = useState({ productId: null, platform: null })
  const navigate = useNavigate()

  const handleSearch = async (e) => {
    e.preventDefault()
    
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query')
      return
    }

    setLoading(true)
    setHasSearched(true)

    try {
      const response = await apiService.searchProducts(searchQuery.trim(), 20)
      setProducts(response.products || [])
      
      if (response.count === 0) {
        toast.error('No products found')
      } else {
        toast.success(`Found ${response.count} product${response.count !== 1 ? 's' : ''}`)
      }
    } catch (error) {
      console.error('Search error:', error)
      toast.error(error.response?.data?.error || 'Failed to search products')
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price) => {
    if (!price || price === 0) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  const getBestPrice = (priceComparison) => {
    const prices = Object.values(priceComparison).filter(p => p && p > 0)
    return prices.length > 0 ? Math.min(...prices) : null
  }

  const getMarketplaceLogo = (marketplace) => {
    const logos = {
      amazon: 'https://compare.buyhatke.com/images/site_icons_m/amazon.png',
      flipkart: 'https://compare.buyhatke.com/images/site_icons_m/flipkart.png',
      myntra: 'https://compare.buyhatke.com/images/site_icons_m/myntra.png'
    }
    return logos[marketplace.toLowerCase()] || ''
  }

  const getMarketplaceColor = (marketplace) => {
    const colors = {
      amazon: 'bg-orange-100 text-orange-800 border-orange-300',
      flipkart: 'bg-blue-100 text-blue-800 border-blue-300',
      myntra: 'bg-pink-100 text-pink-800 border-pink-300'
    }
    return colors[marketplace.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-300'
  }

  const handleAddMarketplaceUrl = async (productId, platform) => {
    const url = prompt(`Enter ${platform} URL for this product:`)
    if (!url || !url.trim()) {
      return
    }

    setAddingUrl({ productId, platform })
    
    try {
      const response = await apiService.addMarketplaceUrl(productId, url.trim(), platform.toLowerCase())
      toast.success(`${platform} price added successfully!`)
      
      // Refresh the search results
      if (searchQuery.trim()) {
        const searchResponse = await apiService.searchProducts(searchQuery.trim(), 20)
        setProducts(searchResponse.products || [])
      }
    } catch (error) {
      console.error('Add marketplace URL error:', error)
      const errorData = error.response?.data
      
      if (errorData?.existingProduct) {
        // Show detailed error about duplicate
        const existingName = errorData.existingProduct.name || 'another product'
        const existingId = errorData.existingProduct.id
        
        toast.error(
          <div>
            <div className="font-semibold">Duplicate Product Detected</div>
            <div className="text-sm mt-1">
              This URL exists in {existingName}. 
              <button 
                onClick={() => navigate(`/products/${existingId}`)}
                className="underline ml-1"
              >
                View that product
              </button>
            </div>
            {errorData.similarProducts && errorData.similarProducts.length > 0 && (
              <div className="text-xs mt-2 text-gray-600">
                Similar products found. Consider merging them.
              </div>
            )}
          </div>,
          { duration: 8000 }
        )
      } else {
        toast.error(errorData?.error || `Failed to add ${platform} URL`)
      }
    } finally {
      setAddingUrl({ productId: null, platform: null })
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Search Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
          <Search className="w-8 h-8 mr-3 text-blue-600" />
          Search Products
        </h1>
        
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product name, brand, category, or paste product URL..."
              className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Search
              </>
            )}
          </button>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div>
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : products.length > 0 ? (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {products.slice(0, 1).map((product) => {
                const bestPrice = getBestPrice(product.priceComparison)
                const highestPrice = product.highestPrice || bestPrice
                const availablePrices = Object.values(product.priceComparison).filter(p => p && p > 0).length
                
                const marketplaces = [
                  { name: 'Amazon', key: 'amazon', price: product.priceComparison.amazon },
                  { name: 'Flipkart', key: 'flipkart', price: product.priceComparison.flipkart },
                  { name: 'Myntra', key: 'myntra', price: product.priceComparison.myntra }
                ].filter(m => m.price && m.price > 0) // Only show marketplaces with prices

                // Get first available marketplace URL for image
                const primaryUrl = product.urls?.amazon || product.urls?.flipkart || product.urls?.myntra
                const specs = product.specifications || {}

                // Calculate percentage savings
                const calculateSavings = (price) => {
                  if (!highestPrice || !price || price >= highestPrice) return null
                  return Math.round(((highestPrice - price) / highestPrice) * 100)
                }

                return (
                  <div key={product.id} className="p-6">
                    {/* Main Product Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                      {/* Left Column - Product Image */}
                      <div className="lg:col-span-1">
                        <div className="relative bg-gray-50 rounded-lg p-8 flex items-center justify-center min-h-[400px]">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="max-w-full max-h-[400px] object-contain"
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/400x400?text=No+Image'
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <ShoppingBag className="w-24 h-24 text-gray-400 mb-4" />
                              <span className="text-gray-500">No image available</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Middle Column - Product Details & Specifications */}
                      <div className="lg:col-span-1">
                        <div className="space-y-4">
                          {/* Product Title */}
                          <div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                              {product.name}
                            </h2>
                            {product.brand && (
                              <p className="text-lg text-gray-700 font-semibold mb-2">{product.brand}</p>
                            )}
                            {(specs.series || specs.modelNumber) && (
                              <p className="text-sm text-gray-600">
                                {specs.series && <span>{specs.series}</span>}
                                {specs.series && specs.modelNumber && <span> • </span>}
                                {specs.modelNumber && <span>Model: {specs.modelNumber}</span>}
                              </p>
                            )}
                          </div>

                          {/* Key Specifications */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Key Specifications</h3>
                            <div className="space-y-2 text-sm">
                              {specs.processor && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Processor:</span>
                                  <span className="font-medium text-gray-900">{specs.processor}</span>
                                </div>
                              )}
                              {specs.ram && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">RAM:</span>
                                  <span className="font-medium text-gray-900">{specs.ram}</span>
                                </div>
                              )}
                              {specs.storage && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Storage:</span>
                                  <span className="font-medium text-gray-900">{specs.storage}</span>
                                </div>
                              )}
                              {specs.operatingSystem && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Operating System:</span>
                                  <span className="font-medium text-gray-900">{specs.operatingSystem}</span>
                                </div>
                              )}
                              {specs.display && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Display:</span>
                                  <span className="font-medium text-gray-900">{specs.display}</span>
                                </div>
                              )}
                              {specs.refreshRate && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Refresh Rate:</span>
                                  <span className="font-medium text-gray-900">{specs.refreshRate}</span>
                                </div>
                              )}
                              {specs.brightness && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Brightness:</span>
                                  <span className="font-medium text-gray-900">{specs.brightness}</span>
                                </div>
                              )}
                              {specs.design && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Design:</span>
                                  <span className="font-medium text-gray-900">{specs.design}</span>
                                </div>
                              )}
                              {specs.color && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Color:</span>
                                  <span className="font-medium text-gray-900">{specs.color}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3">
                            <button
                              onClick={() => navigate(`/products/${product.id}`)}
                              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                            >
                              View Full Details
                            </button>
                            {primaryUrl && (
                              <button
                                onClick={() => window.open(primaryUrl, '_blank')}
                                className="px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2 font-semibold"
                              >
                                <ExternalLink className="w-5 h-5" />
                                Buy Now
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Column - Price Comparison */}
                      <div className="lg:col-span-1">
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border-2 border-blue-200">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                              Compare {availablePrices} Available Prices
                            </h3>
                            {bestPrice && (
                              <div className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                                Best: {formatPrice(bestPrice)}
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            {marketplaces.map((marketplace) => {
                              const hasPrice = marketplace.price && marketplace.price > 0
                              const isBestPrice = hasPrice && marketplace.price === bestPrice
                              const savings = calculateSavings(marketplace.price)
                              
                              return (
                                <div
                                  key={marketplace.key}
                                  className={`bg-white rounded-lg p-4 border-2 transition-all ${
                                    isBestPrice
                                      ? 'border-green-500 shadow-lg'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                      {getMarketplaceLogo(marketplace.key) ? (
                                        <img
                                          src={getMarketplaceLogo(marketplace.key)}
                                          alt={marketplace.name}
                                          className="w-12 h-12 object-contain"
                                        />
                                      ) : (
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                          marketplace.key === 'amazon' ? 'bg-orange-100' :
                                          marketplace.key === 'flipkart' ? 'bg-blue-100' :
                                          marketplace.key === 'myntra' ? 'bg-pink-100' :
                                          'bg-gray-100'
                                        }`}>
                                          <span className="font-bold text-sm">
                                            {marketplace.name.charAt(0)}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex-1">
                                        <div className="font-semibold text-gray-900">{marketplace.name}</div>
                                        <div className="text-xs text-gray-500 mt-1">Free delivery</div>
                                        {savings && savings > 0 && (
                                          <div className="text-xs text-green-600 font-medium mt-1">
                                            {savings}% Cheaper
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className={`text-xl font-bold ${
                                        isBestPrice ? 'text-green-600' : 'text-gray-900'
                                      }`}>
                                        {formatPrice(marketplace.price)}
                                      </div>
                                      {product.urls?.[marketplace.key] && (
                                        <button
                                          onClick={() => window.open(product.urls[marketplace.key], '_blank')}
                                          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                                        >
                                          Buy from {marketplace.name}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            
                            {/* Show marketplaces without prices */}
                            {[
                              { name: 'Amazon', key: 'amazon', price: product.priceComparison.amazon },
                              { name: 'Flipkart', key: 'flipkart', price: product.priceComparison.flipkart },
                              { name: 'Myntra', key: 'myntra', price: product.priceComparison.myntra }
                            ].filter(m => !m.price || m.price === 0).map((marketplace) => (
                              <div
                                key={marketplace.key}
                                className="bg-white rounded-lg p-4 border-2 border-gray-200 opacity-60"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {getMarketplaceLogo(marketplace.key) ? (
                                      <img
                                        src={getMarketplaceLogo(marketplace.key)}
                                        alt={marketplace.name}
                                        className="w-12 h-12 object-contain"
                                      />
                                    ) : (
                                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                        marketplace.key === 'amazon' ? 'bg-orange-100' :
                                        marketplace.key === 'flipkart' ? 'bg-blue-100' :
                                        marketplace.key === 'myntra' ? 'bg-pink-100' :
                                        'bg-gray-100'
                                      }`}>
                                        <span className="font-bold text-sm">
                                          {marketplace.name.charAt(0)}
                                        </span>
                                      </div>
                                    )}
                                    <div className="font-semibold text-gray-900">{marketplace.name}</div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-gray-400 font-medium text-sm">Not Available</span>
                                    {addingUrl.productId === product.id && addingUrl.platform === marketplace.name ? (
                                      <Loader2 className="w-5 h-5 animate-spin text-blue-600 mt-2" />
                                    ) : (
                                      <button
                                        onClick={() => handleAddMarketplaceUrl(product.id, marketplace.name)}
                                        className="mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-xs font-medium flex items-center gap-1"
                                        title={`Add ${marketplace.name} URL and fetch price`}
                                      >
                                        <Plus className="w-3 h-3" />
                                        Add URL
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No products found</h3>
              <p className="text-gray-600 mb-6">
                Try searching with different keywords or add a new product to track.
              </p>
              <button
                onClick={() => navigate('/add-product')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add New Product
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State - Before Search */}
      {!hasSearched && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Search className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <h3 className="text-2xl font-semibold text-gray-900 mb-2">Search for Products</h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Enter a product name, brand, or category to find products in your database and compare prices across Amazon, Flipkart, and Myntra.
          </p>
        </div>
      )}
    </div>
  )
}

export default SearchProducts


