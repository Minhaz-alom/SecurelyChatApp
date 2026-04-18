# Securely Chat App - Deployment Guide

## 🚀 Deploying to Netlify (Frontend) + Railway/Render (Backend)

### Step 1: Deploy Backend First

#### Option A: Deploy to Railway (Recommended)
1. Go to [Railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub"
3. Connect your GitHub repo: `Minhaz-alom/SecurelyChatApp`
4. Railway will auto-detect it's a Java/Spring Boot app
5. Set environment variables:
   - `PORT`: `8080` (Railway sets this automatically)
   - Database variables (if using external DB)
6. Deploy! Get your backend URL: `https://your-app-name.up.railway.app`

#### Option B: Deploy to Render
1. Go to [Render.com](https://render.com) and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub repo: `Minhaz-alom/SecurelyChatApp`
4. Configure:
   - **Runtime**: `Java`
   - **Build Command**: `./mvnw clean install -DskipTests`
   - **Start Command**: `./mvnw spring-boot:run`
5. Deploy! Get your backend URL: `https://your-app-name.onrender.com`

### Step 2: Update Frontend Configuration

1. In `src/main/resources/static/index.html`, update the backend URL:
   ```javascript
   window.SECURELY_BACKEND_URL = "https://your-backend-url-here.onrender.com";
   ```

2. Commit and push the changes:
   ```bash
   git add .
   git commit -m "Update backend URL for production"
   git push origin main
   ```

### Step 3: Deploy Frontend to Netlify

1. Go to [Netlify.com](https://netlify.com) and sign up/login
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repo: `Minhaz-alom/SecurelyChatApp`
4. Configure build settings:
   - **Base directory**: (leave empty)
   - **Build command**: (leave empty - static site)
   - **Publish directory**: `src/main/resources/static`
5. Click "Deploy site"
6. Get your frontend URL: `https://your-site-name.netlify.app`

### Step 4: Update Backend CORS (if needed)

Your backend already allows all origins, but if you want to restrict to only your Netlify domain:

```java
// In CorsConfig.java
.allowedOriginPatterns("https://your-site-name.netlify.app")
```

### Step 5: Test the Deployment

1. Visit your Netlify URL
2. Try logging in - should connect to your deployed backend
3. Test chat functionality

## 🔧 Environment Variables

### Backend (Railway/Render)
```
PORT=8080
# Database vars (if using external DB)
spring.datasource.url=jdbc:postgresql://...
spring.datasource.username=...
spring.datasource.password=...
```

### Frontend (Netlify)
The backend URL is configured in `index.html`:
```javascript
window.SECURELY_BACKEND_URL = "https://your-backend-url.onrender.com";
```

## 🐛 Troubleshooting

### Backend Issues:
- Check Railway/Render logs for errors
- Verify database connectivity
- Ensure PORT environment variable is set

### Frontend Issues:
- Check browser console for CORS errors
- Verify backend URL is correct
- Make sure backend allows your Netlify domain

### WebSocket Issues:
- WebSockets may not work on free tiers of some platforms
- Consider using polling fallback for production

## 📝 Notes

- **Free Tiers**: Railway and Render have generous free tiers
- **Database**: Consider using Railway's built-in PostgreSQL or Supabase
- **WebSockets**: May need upgrade to paid plans for persistent connections
- **CORS**: Backend currently allows all origins for flexibility</content>
<parameter name="filePath">c:\Users\Minhaz\.gemini\antigravity\scratch\java-chat-app\DEPLOYMENT.md