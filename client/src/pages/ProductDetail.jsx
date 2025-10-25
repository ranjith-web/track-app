import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  ArrowLeft, 
  RefreshCw, 
  TrendingUp, 
  Brain, 
  DollarSign, 
  Calendar,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  BarChart3
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts'
import { apiService } from '../services/apiService'
import toast from 'react-hot-toast'

const ProductDetail = () => {
  const { id } = useParams()
  const [product, setProduct] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisCached, setAnalysisCached] = useState(false)
  const [insightsCached, setInsightsCached] = useState(false)
  const [timeRange, setTimeRange] = useState('max')

  useEffect(() => {
    fetchProductData()
  }, [id])

  const fetchProductData = async () => {
    try {
      setLoading(true)
      const [productResponse, historyResponse] = await Promise.all([
        apiService.getProduct(id),
        apiService.getPriceHistory(id)
      ])
      
      setProduct(productResponse.product)
      setPriceHistory(historyResponse.product?.priceHistory || [])
      
      // Automatically load AI analysis and insights
      const priceHistory = historyResponse.product?.priceHistory || []
      
      // Load AI analysis if we have enough price history OR if it's a new product
      if (priceHistory.length >= 2) {
        handleAnalyzePrice(true) // Pass true to indicate auto-load
      } else if (productResponse.product?.aiAnalysis) {
        // Use existing analysis if available
        setAiAnalysis(productResponse.product.aiAnalysis)
      } else {
        // For new products with only 1 price point, still try to load AI analysis
        // This will show "insufficient data" but allows the user to see the attempt
        handleAnalyzePrice(true)
      }
      
      // Load buying insights automatically
      handleGetInsights(true) // Pass true to indicate auto-load
      
    } catch (error) {
      console.error('Error fetching product data:', error)
      toast.error('Failed to load product details')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePrice = async () => {
    try {
      setUpdating(true)
      const response = await apiService.updatePrice(id)
      
      // Show different messages based on cache/scrape status
      if (response.updateInfo) {
        const { cached, scraped, failed } = response.updateInfo
        
        if (cached.length > 0 && scraped.length === 0) {
          toast.success('Prices retrieved from cache (updated within last hour)', {
            icon: '⚡',
            duration: 3000
          })
        } else if (scraped.length > 0) {
          toast.success(`Fresh prices fetched from ${scraped.join(', ')}!`, {
            icon: '✅',
            duration: 3000
          })
        }
        
        if (failed.length > 0) {
          toast.error(`Failed to update: ${failed.join(', ')}`, {
            duration: 4000
          })
        }
      } else {
        toast.success('Price updated successfully!')
      }
      
      fetchProductData() // Refresh data
    } catch (error) {
      console.error('Error updating price:', error)
      toast.error('Failed to update price')
    } finally {
      setUpdating(false)
    }
  }

  const handleAnalyzePrice = async (isAutoLoad = false) => {
    try {
      setAnalyzing(true)
      const response = await apiService.analyzePrice(id)
      setAiAnalysis(response.analysis)
      setAnalysisCached(response.cached || false)
      
      // Only show toast if manually triggered (button click)
      if (!isAutoLoad) {
        if (response.cached) {
          toast.success('Analysis from cache (price unchanged)', { icon: '💾' })
        } else {
          toast.success('AI analysis refreshed!', { icon: '✨' })
        }
      }
    } catch (error) {
      console.error('Error analyzing price:', error)
      
      // Handle insufficient data case gracefully
      if (error.response?.data?.error?.includes('Insufficient price history')) {
        // Set a placeholder analysis for insufficient data
        setAiAnalysis({
          trend: 'insufficient_data',
          confidence: 0,
          prediction: 'Need more price data for trend analysis',
          recommendation: 'Add more products or wait for price updates',
          stability: 'unknown',
          analysis: 'Insufficient price history for analysis. Price tracking runs 3 times daily to build historical data.',
          lastAnalyzed: new Date().toISOString()
        })
      } else {
        // Only show error toast if manually triggered
        if (!isAutoLoad) {
          toast.error('Failed to analyze price trend')
        }
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGetInsights = async (isAutoLoad = false) => {
    try {
      const response = await apiService.getInsights(id)
      setInsights(response.insights)
      setInsightsCached(response.cached || false)
      
      // Only show toast if manually triggered (button click)
      if (!isAutoLoad) {
        if (response.cached) {
          toast.success('Insights from cache (price unchanged)', { icon: '💾' })
        } else {
          toast.success('Insights refreshed!', { icon: '✨' })
        }
      }
    } catch (error) {
      console.error('Error getting insights:', error)
      // Only show error toast if manually triggered
      if (!isAutoLoad) {
        toast.error('Failed to get buying insights')
      }
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

  const formatPriceHistory = (history, range = 'max') => {
    if (!history || history.length === 0) return []
    
    const now = new Date()
    let filteredHistory = history
    
    // Filter based on time range
    if (range === '1m') {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      filteredHistory = history.filter(entry => new Date(entry.timestamp) >= oneMonthAgo)
    } else if (range === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      filteredHistory = history.filter(entry => new Date(entry.timestamp) >= threeMonthsAgo)
    }
    
    return filteredHistory.map(entry => ({
      date: new Date(entry.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      price: entry.price,
      source: entry.source,
      fullDate: new Date(entry.timestamp).toLocaleDateString('en-IN', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      timestamp: new Date(entry.timestamp).getTime()
    })).sort((a, b) => a.timestamp - b.timestamp)
  }

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'increasing': return 'text-red-600'
      case 'decreasing': return 'text-green-600'
      case 'stable': return 'text-blue-600'
      default: return 'text-gray-600'
    }
  }

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'increasing': return '↗️'
      case 'decreasing': return '↘️'
      case 'stable': return '→'
      default: return '❓'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="loading"></div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Product Not Found</h3>
        <p className="text-gray-600 mb-6">The product you're looking for doesn't exist.</p>
        <Link to="/products" className="btn btn-primary">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Products
        </Link>
      </div>
    )
  }

  const lowestPrice = getLowestPrice(product.currentPrice)
  const priceSources = getPriceSources(product.currentPrice)
  const chartData = formatPriceHistory(priceHistory, timeRange)
  
  // Debug logging
  console.log('🔍 Debug Chart Data:', {
    priceHistoryLength: priceHistory.length,
    chartDataLength: chartData.length,
    timeRange,
    chartData: chartData
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link to="/products" className="btn btn-secondary">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Products
        </Link>
        <button
          onClick={handleUpdatePrice}
          disabled={updating}
          className="btn btn-primary"
        >
          {updating ? (
            <div className="loading w-4 h-4 mr-2"></div>
          ) : (
            <RefreshCw className="w-5 h-5 mr-2" />
          )}
          Update Price
        </button>
      </div>

      {/* Product Info */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-6">
          {product.image && (
            <img
              src={product.image}
              alt={product.name}
              className="w-full lg:w-64 h-64 object-cover rounded-lg"
            />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>
            
            {lowestPrice && (
              <div className="text-4xl font-bold text-green-600 mb-4">
                ₹{lowestPrice.toLocaleString()}
              </div>
            )}

            {priceSources.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Available on:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {priceSources.map(({ source, price }) => (
                    <div key={source} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{source}</span>
                        <span className="text-lg font-bold text-green-600">
                          ₹{price.toLocaleString()}
                        </span>
                      </div>
                      <a
                        href={product.urls?.[source]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm mt-2"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Visit Store
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">Clicks</div>
                <div className="font-semibold">{product.clickCount || 0}</div>
              </div>
              <div>
                <div className="text-gray-500">Last Checked</div>
                <div className="font-semibold">
                  {new Date(product.lastChecked).toLocaleDateString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Price Points</div>
                <div className="font-semibold">{priceHistory.length}</div>
              </div>
              <div>
                <div className="text-gray-500">Status</div>
                <div className="font-semibold text-green-600">Active</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 flex items-center">
                <Brain className="w-6 h-6 mr-2 text-purple-600" />
                AI Analysis
              </h2>
              {aiAnalysis && aiAnalysis.lastAnalyzed && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  {analysisCached && <span title="Saved result (price unchanged)">💾</span>}
                  {new Date(aiAnalysis.lastAnalyzed).toLocaleDateString('en-IN', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </div>
            <button
              onClick={() => handleAnalyzePrice(false)}
              disabled={analyzing || priceHistory.length < 2}
              className="btn btn-secondary text-sm"
              title="Refresh AI analysis"
            >
              {analyzing ? (
                <div className="loading w-4 h-4 mr-1"></div>
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Refresh
            </button>
          </div>

          {analyzing && !aiAnalysis ? (
            <div className="text-center py-8">
              <div className="loading w-12 h-12 mx-auto mb-4"></div>
              <p className="text-gray-600">Analyzing price trends...</p>
            </div>
          ) : aiAnalysis ? (
            <div className="space-y-4">
              {aiAnalysis.trend !== 'insufficient_data' ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Trend:</span>
                    <span className={`font-semibold ${getTrendColor(aiAnalysis.trend)}`}>
                      {getTrendIcon(aiAnalysis.trend)} {aiAnalysis.trend?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Confidence:</span>
                    <span className="font-semibold">{aiAnalysis.confidence || 0}%</span>
                  </div>
                </>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="text-yellow-600 mr-2">⚠️</div>
                    <div className="text-sm text-yellow-800">
                      <strong>Insufficient Data:</strong> Need more price points for trend analysis
                    </div>
                  </div>
                </div>
              )}
              <div>
                <span className="text-gray-600 block mb-2">Prediction:</span>
                <p className="text-sm text-gray-700">{aiAnalysis.prediction}</p>
              </div>
              <div>
                <span className="text-gray-600 block mb-2">Recommendation:</span>
                <p className="text-sm text-gray-700">{aiAnalysis.recommendation}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {priceHistory.length < 2 
                  ? 'Need more price data for trend analysis. Add more products or wait for price updates.' 
                  : 'Loading AI insights...'
                }
              </p>
              {priceHistory.length < 2 && (
                <div className="mt-4 text-sm text-blue-600">
                  💡 Price tracking runs 3 times daily to build historical data
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 flex items-center">
                <DollarSign className="w-6 h-6 mr-2 text-green-600" />
                Buying Insights
              </h2>
              {insights && insights.lastAnalyzed && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  {insightsCached && <span title="Saved result (price unchanged)">💾</span>}
                  {new Date(insights.lastAnalyzed).toLocaleDateString('en-IN', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </div>
            <button
              onClick={() => handleGetInsights(false)}
              className="btn btn-secondary text-sm"
              title="Refresh buying insights"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </button>
          </div>

          {!insights && loading ? (
            <div className="text-center py-8">
              <div className="loading w-12 h-12 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading buying insights...</p>
            </div>
          ) : insights ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Deal Score:</span>
                <span className="font-semibold text-green-600">{insights.dealScore}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Good Deal:</span>
                <span className={`font-semibold ${insights.isGoodDeal ? 'text-green-600' : 'text-red-600'}`}>
                  {insights.isGoodDeal ? 'Yes' : 'No'}
                </span>
              </div>
              
              {/* Review Summary */}
              {insights.reviewSummary && insights.reviewSummary.totalGenuineReviews > 0 && (
                <div className="border-t pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Customer Rating:</span>
                    <span className="font-semibold text-yellow-600">
                      ⭐ {insights.reviewSummary.averageRating}/5
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{insights.reviewSummary.totalGenuineReviews} genuine reviews</span>
                    <span className="text-red-500">
                      {insights.reviewSummary.fakeReviewPercentage}% fake filtered
                    </span>
                  </div>
                </div>
              )}
              
              <div>
                <span className="text-gray-600 block mb-2">Strategy:</span>
                <p className="text-sm text-gray-700">{insights.strategy}</p>
              </div>
              <div>
                <span className="text-gray-600 block mb-2">Insights:</span>
                <p className="text-sm text-gray-700">{insights.insights}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Loading insights...</p>
            </div>
          )}
        </div>
      </div>

      {/* Price History Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
            Price History
          </h2>
          
          {/* Time Range Selector */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setTimeRange('1m')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                timeRange === '1m' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              1 Month
            </button>
            <button
              onClick={() => setTimeRange('3m')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                timeRange === '3m' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              3 Month
            </button>
            <button
              onClick={() => setTimeRange('max')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                timeRange === 'max' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Max
            </button>
          </div>
        </div>
        
        {chartData.length > 0 ? (
          <div>
            {/* Debug info */}
            <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
              <strong>Debug:</strong> Chart data length: {chartData.length}, Time range: {timeRange}
              <br />
              <strong>Data:</strong> {JSON.stringify(chartData, null, 2)}
            </div>
            
            {/* Show message if all prices are identical */}
            {chartData.length > 1 && chartData.every(d => d.price === chartData[0].price) && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center">
                  <div className="text-blue-600 mr-2">📊</div>
                  <div className="text-sm text-blue-800">
                    <strong>Stable Price:</strong> The price has remained constant at ₹{chartData[0].price.toLocaleString()} across all tracked periods.
                  </div>
                </div>
              </div>
            )}
            
            <div className="h-96 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
              {/* Test with simple data first */}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={[
                    { date: '22 Oct', price: 154900 },
                    { date: '22 Oct', price: 154900 }
                  ]} 
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    domain={[150000, 160000]}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                  />
                  <Tooltip 
                    formatter={(value) => [`₹${value.toLocaleString()}`, 'Price']}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: '#ef4444', strokeWidth: 2, fill: 'white' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Chart Stats */}
            <div className="mt-4 flex justify-between text-sm text-gray-500">
              <span>{chartData.length} data point{chartData.length !== 1 ? 's' : ''}</span>
              <span>
                Range: ₹{Math.min(...chartData.map(d => d.price)).toLocaleString()} - ₹{Math.max(...chartData.map(d => d.price)).toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-blue-50 rounded-lg">
            <Calendar className="w-16 h-16 text-blue-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Building Price History...
            </h3>
            <p className="text-gray-600 mb-4 max-w-md mx-auto">
              We're tracking this product's price automatically 3 times a day. 
              Historical data will appear here as we collect more price points over time.
            </p>
            <div className="text-sm text-gray-500">
              <p>📊 Price checks: 8:00 AM, 2:00 PM, 8:00 PM IST</p>
              <p className="mt-1">🔄 Next check scheduled automatically</p>
            </div>
          </div>
        )}
      </div>

      {/* Customer Reviews Insights */}
      {insights && insights.reviewSummary && insights.reviewSummary.pros && insights.reviewSummary.pros.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Customer Reviews Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pros */}
            <div>
              <h3 className="font-semibold text-green-600 mb-3 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                What Customers Like
              </h3>
              <ul className="space-y-2">
                {insights.reviewSummary.pros.map((pro, index) => (
                  <li key={index} className="text-sm text-gray-700 flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Cons */}
            {insights.reviewSummary.cons && insights.reviewSummary.cons.length > 0 && (
              <div>
                <h3 className="font-semibold text-red-600 mb-3 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Common Concerns
                </h3>
                <ul className="space-y-2">
                  {insights.reviewSummary.cons.map((con, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start">
                      <span className="text-red-500 mr-2">✗</span>
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-800">
              💡 <strong>Fake Review Detection:</strong> We filtered out {insights.reviewSummary.fakeReviewPercentage}% suspicious reviews to show you only genuine customer feedback.
            </p>
          </div>
        </div>
      )}

    </div>
  )
}

export default ProductDetail
