# Deployment Guide - Separate Frontend & Backend

## 🎯 Recommended Setup

**Frontend:** Vercel (Free)  
**Backend:** Railway ($5/month)  
**Database:** MongoDB Atlas (Free)  
**Total Cost:** ~$5/month

---

## 📋 Prerequisites

- [ ] GitHub account
- [ ] Code pushed to GitHub repository
- [ ] Vercel account (sign up with GitHub)
- [ ] Railway account (sign up with GitHub)
- [ ] MongoDB Atlas account (free)

---

## 🗄️ Step 1: Setup MongoDB Atlas (5 minutes)

### 1.1 Create Cluster

```bash
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up / Log in
3. Create a FREE cluster:
   - Cloud Provider: AWS
   - Region: Choose closest to you
   - Cluster Tier: M0 Sandbox (FREE)
   - Cluster Name: price-tracker
```

### 1.2 Create Database User

```bash
1. Go to "Database Access"
2. Click "Add New Database User"
3. Username: trackapp
4. Password: (Generate secure password)
5. Database User Privileges: Read and write to any database
6. Save!
```

### 1.3 Whitelist IP Addresses

```bash
1. Go to "Network Access"
2. Click "Add IP Address"
3. Choose "Allow Access from Anywhere" (0.0.0.0/0)
   - Safe because Railway IPs are dynamic
4. Confirm
```

### 1.4 Get Connection String

```bash
1. Go to "Database" → "Connect"
2. Choose "Connect your application"
3. Copy the connection string:
   mongodb+srv://trackapp:<password>@cluster0.xxxxx.mongodb.net/pricetracker

4. Replace <password> with your actual password
5. Replace database name if needed
```

**Save this connection string!** You'll need it for Railway.

---

## 🎨 Step 2: Deploy Frontend to Vercel (5 minutes)

### 2.1 Push Code to GitHub

```bash
cd /Users/ranjithr_500393/Desktop/Projects/track-app

# Make sure everything is committed
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### 2.2 Import to Vercel

```bash
1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your track-app repo
4. Configure:
   - Framework Preset: Vite
   - Root Directory: client
   - Build Command: npm run build
   - Output Directory: dist
   - Install Command: npm install
```

### 2.3 Add Environment Variables

```bash
In Vercel dashboard:
1. Go to Settings → Environment Variables
2. Add variable:
   Name: VITE_API_URL
   Value: (Leave blank for now, will update after backend deploy)
   Environment: Production
```

### 2.4 Deploy

```bash
1. Click "Deploy"
2. Wait 2-3 minutes
3. You'll get a URL like: https://track-app-xxx.vercel.app
```

**Save this URL!** This is your frontend.

---

## 🚀 Step 3: Deploy Backend to Railway (5 minutes)

### 3.1 Install Railway CLI (Optional)

```bash
npm install -g @railway/cli

# Or skip CLI and use web dashboard only
```

### 3.2 Import to Railway

```bash
1. Go to https://railway.app/new
2. Choose "Deploy from GitHub repo"
3. Select your track-app repo
4. Configure:
   - Root Directory: server
   - Build Command: npm install
   - Start Command: npm start
```

### 3.3 Add Environment Variables

```bash
In Railway dashboard:
1. Go to Variables tab
2. Add the following variables:

PORT=5001

NODE_ENV=production

MONGODB_URI=mongodb+srv://trackapp:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/pricetracker

GEMINI_API_KEY=your_gemini_api_key_here

FRONTEND_URL=https://track-app-xxx.vercel.app
(Use the URL from Step 2.4)
```

### 3.4 Deploy

```bash
1. Railway automatically deploys
2. Wait 3-4 minutes
3. You'll get a URL like: https://track-app-production.railway.app
```

**Save this URL!** This is your backend API.

---

## 🔗 Step 4: Connect Frontend to Backend (2 minutes)

### 4.1 Update Vercel Environment Variable

```bash
1. Go back to Vercel dashboard
2. Go to Settings → Environment Variables
3. Edit VITE_API_URL:
   Value: https://track-app-production.railway.app
   (Use the Railway URL from Step 3.4)
4. Save
```

### 4.2 Redeploy Frontend

```bash
1. Go to Deployments tab in Vercel
2. Click the three dots on latest deployment
3. Click "Redeploy"
4. Wait 2 minutes
```

---

## ✅ Step 5: Test Your Deployment (3 minutes)

### 5.1 Test Backend Health

```bash
# Replace with your actual Railway URL
curl https://track-app-production.railway.app/api/health

# Expected response:
{
  "status": "OK",
  "timestamp": "2025-10-21T..."
}
```

### 5.2 Test Frontend

```bash
1. Open your Vercel URL in browser
2. Should see your app homepage
3. Try adding a product
4. Try updating prices
```

### 5.3 Check Automated Tracking

```bash
# Check Railway logs
1. Go to Railway dashboard
2. Click on your project
3. Go to "Deployments" tab
4. Click "View Logs"
5. Look for:
   🤖 Price Tracker Service: Starting automated tracking...
   ✅ Price tracking scheduled: 3 times daily
```

---

## 🎯 Step 6: Custom Domain (Optional)

### 6.1 Add Domain to Vercel

```bash
1. Buy domain (Namecheap, GoDaddy, etc.)
2. Go to Vercel project → Settings → Domains
3. Add your domain: trackapp.com
4. Follow DNS configuration instructions
5. Wait for DNS propagation (5-30 minutes)
```

### 6.2 Update Backend CORS

```bash
1. Go to Railway → Variables
2. Update FRONTEND_URL to your custom domain:
   FRONTEND_URL=https://trackapp.com
3. Railway auto-redeploys
```

---

## 📊 Monitoring & Logs

### Frontend Logs (Vercel)

```bash
1. Go to Vercel dashboard
2. Select your project
3. Go to "Functions" or "Logs" tab
4. Real-time logs visible
```

### Backend Logs (Railway)

```bash
1. Go to Railway dashboard
2. Select your project
3. Click "View Logs"
4. Real-time logs with search/filter
```

### Database Monitoring (MongoDB)

```bash
1. Go to MongoDB Atlas dashboard
2. Go to "Metrics" tab
3. See connections, operations, storage
```

---

## 🔧 Troubleshooting

### Issue 1: CORS Error

**Symptom:** Frontend can't connect to backend

**Solution:**
```bash
1. Check Railway environment variables
2. Verify FRONTEND_URL matches Vercel URL exactly
3. Check browser console for exact error
4. Verify server/index.js CORS config
```

### Issue 2: Backend Not Starting

**Symptom:** Railway shows "Crashed" status

**Solution:**
```bash
1. Check Railway logs for errors
2. Verify all environment variables are set
3. Verify MONGODB_URI is correct
4. Check if PORT=5001 is set
```

### Issue 3: MongoDB Connection Error

**Symptom:** "MongooseError: Could not connect"

**Solution:**
```bash
1. Verify MongoDB Atlas is running
2. Check connection string is correct
3. Verify IP whitelist includes 0.0.0.0/0
4. Check database user credentials
```

### Issue 4: Cron Jobs Not Running

**Symptom:** Prices not updating automatically

**Solution:**
```bash
1. Check Railway logs for:
   "🤖 Price Tracker Service: Starting..."
2. Verify Railway is not sleeping (upgrade plan)
3. Check timezone settings in priceTrackerService.js
```

### Issue 5: Scraping Timeout

**Symptom:** Playwright timeouts on Railway

**Solution:**
```bash
1. Railway may need more resources
2. Increase timeout in scraperService.js
3. Consider upgrading Railway plan
4. Check if Playwright installed correctly
```

---

## 💰 Cost Breakdown

### Free Tier Limits:

**Vercel (Free):**
- ✅ Unlimited bandwidth
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Instant deployment
- ⚠️ 100GB bandwidth/month
- ⚠️ Commercial projects need Pro ($20/month)

**Railway (Hobby - $5/month):**
- ✅ $5 credit/month included
- ✅ 500 execution hours
- ✅ 512MB RAM
- ✅ 1GB disk
- ⚠️ Additional usage: $0.000231/GB-hour

**MongoDB Atlas (Free):**
- ✅ 512MB storage
- ✅ Shared cluster
- ⚠️ Good for ~10,000 products

### When to Upgrade:

**Vercel Pro ($20/month) - Upgrade when:**
- Using for commercial purposes
- Need faster build times
- Need analytics
- Need password protection

**Railway Pro ($20/month) - Upgrade when:**
- Exceeding 500 hours/month
- Need more RAM (scraping heavy)
- Need priority support

**MongoDB Paid ($9+/month) - Upgrade when:**
- Exceeding 512MB storage (~10k products)
- Need backup/restore
- Need better performance

---

## 🚀 Auto-Deployment (CI/CD)

Both Vercel and Railway auto-deploy when you push to GitHub!

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Automatically:
✅ Vercel builds and deploys frontend (2-3 min)
✅ Railway builds and deploys backend (3-4 min)
✅ No manual steps needed!
```

### Disable Auto-Deploy (if needed):

**Vercel:**
```bash
1. Settings → Git
2. Uncheck "Production Branch"
```

**Railway:**
```bash
1. Settings → Deployments
2. Disable "Auto Deploy"
```

---

## 📈 Scaling Strategy

### At 1,000 Users:
- ✅ Free tiers work fine
- Cost: $5/month (Railway Hobby)

### At 10,000 Users:
- ⚠️ Upgrade Railway to Pro ($20/month)
- ⚠️ Consider MongoDB paid tier ($9/month)
- Cost: ~$29/month

### At 100,000 Users:
- ⚠️ Multiple Railway instances
- ⚠️ MongoDB dedicated cluster ($57+/month)
- ⚠️ Consider Vercel Pro ($20/month)
- Cost: ~$100-200/month

---

## 🎓 Next Steps After Deployment

1. **Set up monitoring:**
   - Add Sentry for error tracking
   - Add Google Analytics
   - Set up uptime monitoring (UptimeRobot)

2. **Improve performance:**
   - Add Redis caching (Upstash free tier)
   - Optimize database queries
   - Add compression

3. **Add features:**
   - User authentication
   - Email notifications
   - Payment integration (if monetizing)

4. **Security:**
   - Add rate limiting (already have ✅)
   - Add API key authentication
   - Regular security audits

---

## ✅ Deployment Checklist

Before going live:

- [ ] MongoDB Atlas cluster created
- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to Railway
- [ ] Environment variables set correctly
- [ ] CORS configured properly
- [ ] Health check endpoint working
- [ ] Test product tracking
- [ ] Test AI analysis
- [ ] Test automated cron jobs
- [ ] Custom domain configured (optional)
- [ ] Monitoring set up
- [ ] Error tracking configured
- [ ] Backup strategy planned

---

## 📞 Support Resources

**Vercel:**
- Docs: https://vercel.com/docs
- Discord: https://vercel.com/discord
- Status: https://vercel-status.com

**Railway:**
- Docs: https://docs.railway.app
- Discord: https://discord.gg/railway
- Status: https://status.railway.app

**MongoDB Atlas:**
- Docs: https://docs.atlas.mongodb.com
- Support: https://support.mongodb.com
- Status: https://status.mongodb.com

---

## 🎉 You're Deployed!

**Frontend:** https://your-app.vercel.app  
**Backend:** https://your-app.railway.app  
**Total Time:** ~20 minutes  
**Total Cost:** $5/month  
**Status:** 🚀 Production Ready!

Congratulations! Your price tracking app is now live! 🎊

