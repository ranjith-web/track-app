import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, DollarSign, BarChart3, Brain, ArrowRight, Star } from 'lucide-react'
import { apiService } from '../services/apiService'
import toast from 'react-hot-toast'

const Home = () => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalClicks: 0,
    averageSavings: 0,
    activeTrackers: 0
  })
  const [recentProducts, setRecentProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [productsResponse] = await Promise.all([
        apiService.getProducts({ limit: 5 })
      ])

      setRecentProducts(productsResponse.products || [])
      
      // Calculate stats from products
      const totalClicks = productsResponse.products?.reduce((sum, product) => sum + (product.clickCount || 0), 0) || 0
      const totalProducts = productsResponse.products?.length || 0
      
      setStats({
        totalProducts,
        totalClicks,
        averageSavings: 0, // This would need more complex calculation
        activeTrackers: totalProducts
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "AI-Powered Analysis",
      description: "Get accurate price predictions and trend analysis using advanced AI algorithms."
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      title: "Multi-Platform Tracking",
      description: "Track prices across Amazon, Flipkart, and Myntra simultaneously."
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Price History",
      description: "View detailed price history and trends for the last 3 months."
    },
    {
      icon: <Brain className="w-6 h-6" />,
      title: "Smart Recommendations",
      description: "Get AI-powered buying recommendations and best time to purchase alerts."
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="loading"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AI-Powered Price Tracking
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Track prices across Amazon, Flipkart, and Myntra with intelligent AI analysis. 
          Get accurate price predictions and never miss a good deal.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/add-product"
            className="btn btn-primary text-lg px-8 py-3"
          >
            Start Tracking
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
          <Link
            to="/products"
            className="btn btn-secondary text-lg px-8 py-3"
          >
            View Products
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">{stats.totalProducts}</div>
          <div className="text-gray-600">Products Tracked</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">{stats.totalClicks}</div>
          <div className="text-gray-600">Total Clicks</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-purple-600 mb-2">{stats.averageSavings}%</div>
          <div className="text-gray-600">Avg. Savings</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-orange-600 mb-2">{stats.activeTrackers}</div>
          <div className="text-gray-600">Active Trackers</div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (
          <div key={index} className="card text-center hover:shadow-lg transition-shadow">
            <div className="text-blue-600 mb-4 flex justify-center">
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
            <p className="text-gray-600 text-sm">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* Recent Products */}
      {recentProducts.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <Star className="w-6 h-6 mr-2 text-yellow-500" />
            Recently Added Products
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProducts.map((product) => (
              <div key={product._id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-3">
                  {product.image && (
                    <img 
                      src={product.image} 
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                    <div className="text-sm text-gray-500">
                      {product.currentPrice && Object.values(product.currentPrice).filter(p => p).length > 0 && (
                        <span className="text-green-600 font-semibold">
                          ₹{Math.min(...Object.values(product.currentPrice).filter(p => p))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {product.clickCount || 0} clicks
                  </span>
                  <Link
                    to={`/products/${product._id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link
              to="/products"
              className="btn btn-secondary"
            >
              View All Products
            </Link>
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className="card bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start Saving?</h2>
        <p className="text-xl mb-6 opacity-90">
          Join thousands of smart shoppers who save money with AI-powered price tracking.
        </p>
        <Link
          to="/add-product"
          className="btn bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-3"
        >
          Add Your First Product
        </Link>
      </div>
    </div>
  )
}

export default Home
