# Price Tracker - AI-Powered E-commerce Price Monitoring

A comprehensive price tracking application that monitors product prices across Amazon, Flipkart, and Myntra using AI-powered analysis for accurate price predictions and trend analysis.

## 🚀 Features

- **Multi-Platform Tracking**: Monitor prices across Amazon, Flipkart, and Myntra simultaneously
- **AI-Powered Analysis**: Get accurate price predictions and trend analysis using OpenAI
- **Price History**: Track price changes for the last 3 months with detailed charts
- **Smart Recommendations**: AI-generated buying recommendations and best time to purchase alerts
- **Click Tracking**: Monitor product engagement and popularity
- **Real-time Updates**: Automatic price updates with manual refresh options
- **Modern UI**: Beautiful, responsive interface built with React and Vite

## 🛠️ Tech Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose for data persistence
- **Puppeteer** for web scraping
- **OpenAI API** for AI-powered analysis
- **Rate limiting** and security middleware

### Frontend
- **React 18** with modern hooks
- **Vite** for fast development and building
- **React Router** for navigation
- **Recharts** for data visualization
- **Lucide React** for icons
- **React Hot Toast** for notifications

## 📦 Installation

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or cloud)
- OpenAI API key

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd price-tracker
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Environment Setup**
   ```bash
   # Copy environment file
   cp server/.env.example server/.env
   
   # Edit server/.env with your configuration
   PORT=5001
   MONGODB_URI=mongodb://localhost:27017/price-tracker
   OPENAI_API_KEY=your_openai_api_key_here
   NODE_ENV=development
   ```

4. **Start the application**
   ```bash
   # Development mode (runs both backend and frontend)
   npm run dev
   
   # Or run separately
   npm run server  # Backend on port 5001
   npm run client  # Frontend on port 5173
   ```

## 🔧 Configuration

### MongoDB Setup
- Install MongoDB locally or use MongoDB Atlas
- Update `MONGODB_URI` in your `.env` file

### OpenAI API Setup
- Get your API key from [OpenAI Platform](https://platform.openai.com/)
- Add it to your `.env` file as `OPENAI_API_KEY`

### Supported E-commerce Platforms
- **Amazon**: amazon.in, amazon.com
- **Flipkart**: flipkart.com
- **Myntra**: myntra.com

## 📱 Usage

### Adding Products
1. Navigate to "Add Product" page
2. Paste the product URL from Amazon, Flipkart, or Myntra
3. The system will automatically detect the platform and extract product information
4. Start tracking prices with AI analysis

### Viewing Products
- **Product List**: View all tracked products with current prices
- **Product Details**: Detailed view with price history, AI analysis, and insights
- **Price Charts**: Visual representation of price trends over time

### AI Features
- **Price Analysis**: Get trend predictions and confidence scores
- **Buying Insights**: AI recommendations on whether to buy now or wait
- **Price Alerts**: Set target prices and get notified when reached

## 🔌 API Endpoints

### Products
- `GET /api/prices/products` - Get all tracked products
- `POST /api/prices/track` - Add new product for tracking
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product information
- `DELETE /api/products/:id` - Delete product

### Prices
- `GET /api/prices/current/:id` - Get current price
- `POST /api/prices/update/:id` - Update product price
- `GET /api/prices/history/:id` - Get price history
- `POST /api/prices/click/:id` - Track product click

### AI Analysis
- `POST /api/ai/analyze/:id` - Analyze price trend
- `GET /api/ai/insights/:id` - Get buying insights
- `GET /api/ai/recommendations/:id` - Get AI recommendations
- `POST /api/ai/alert/:id` - Generate price alert

## 🏗️ Project Structure

```
price-tracker/
├── server/                 # Backend Node.js application
│   ├── config/            # Database configuration
│   ├── models/            # MongoDB models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── index.js          # Server entry point
├── client/               # Frontend React application
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   └── utils/        # Utility functions
│   └── public/           # Static assets
└── package.json          # Root package configuration
```

## 🚀 Deployment

### Backend Deployment
1. Set up MongoDB Atlas or your preferred MongoDB hosting
2. Configure environment variables
3. Deploy to platforms like Heroku, Railway, or AWS

### Frontend Deployment
1. Build the frontend: `npm run build`
2. Deploy to platforms like Vercel, Netlify, or AWS S3

## 🔒 Security Features

- Rate limiting to prevent abuse
- CORS configuration for secure cross-origin requests
- Helmet.js for security headers
- Input validation and sanitization
- Error handling and logging

## 📊 Monitoring

- Health check endpoint: `GET /api/health`
- Click tracking for analytics
- Price update logging
- AI analysis confidence scoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API endpoints

## 🔮 Future Enhancements

- [ ] Email/SMS notifications for price alerts
- [ ] Mobile app development
- [ ] More e-commerce platforms support
- [ ] Advanced AI features
- [ ] User authentication and personal dashboards
- [ ] Bulk product import
- [ ] Price comparison across platforms
- [ ] Historical data export
