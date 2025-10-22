import React, { useState } from 'react'
import { apiService } from '../services/apiService'
import toast from 'react-hot-toast'

const TestConnection = () => {
  const [testResults, setTestResults] = useState({})
  const [loading, setLoading] = useState(false)

  const runTests = async () => {
    setLoading(true)
    const results = {}

    try {
      // Test 1: Health Check
      console.log('Testing health check...')
      const health = await apiService.healthCheck()
      results.health = { success: true, data: health }
      console.log('Health check result:', health)
    } catch (error) {
      results.health = { success: false, error: error.message }
      console.error('Health check failed:', error)
    }

    try {
      // Test 2: Get Products
      console.log('Testing get products...')
      const products = await apiService.getProducts()
      results.products = { success: true, data: products }
      console.log('Products result:', products)
    } catch (error) {
      results.products = { success: false, error: error.message }
      console.error('Get products failed:', error)
    }

    try {
      // Test 3: Add Product (if products exist)
      if (results.products?.success && results.products.data?.products?.length > 0) {
        const productId = results.products.data.products[0]._id
        console.log('Testing get single product...')
        const product = await apiService.getProduct(productId)
        results.singleProduct = { success: true, data: product }
        console.log('Single product result:', product)
      }
    } catch (error) {
      results.singleProduct = { success: false, error: error.message }
      console.error('Get single product failed:', error)
    }

    setTestResults(results)
    setLoading(false)
    
    const successCount = Object.values(results).filter(r => r.success).length
    const totalCount = Object.keys(results).length
    
    if (successCount === totalCount) {
      toast.success(`All ${totalCount} tests passed!`)
    } else {
      toast.error(`${successCount}/${totalCount} tests passed`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">API Connection Test</h1>
      
      <div className="mb-6">
        <button
          onClick={runTests}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? 'Running Tests...' : 'Run Tests'}
        </button>
      </div>

      <div className="space-y-4">
        {Object.entries(testResults).map(([testName, result]) => (
          <div key={testName} className="card">
            <h3 className="text-lg font-semibold mb-2 capitalize">
              {testName.replace(/([A-Z])/g, ' $1').trim()}
            </h3>
            <div className={`p-3 rounded ${
              result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              <div className="font-medium">
                {result.success ? '✅ Success' : '❌ Failed'}
              </div>
              {result.error && (
                <div className="text-sm mt-1">Error: {result.error}</div>
              )}
              {result.data && (
                <div className="text-sm mt-1">
                  <pre className="whitespace-pre-wrap text-xs">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(testResults).length === 0 && (
        <div className="text-center text-gray-500 py-8">
          Click "Run Tests" to test API connectivity
        </div>
      )}
    </div>
  )
}

export default TestConnection
