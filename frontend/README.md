# Real-Time Webcam AI Vision Captioning

A modern web application that captures images from your webcam and generates AI-powered captions using advanced vision-language models.

## 🎯 Features

- **Real-time webcam capture** with HTML5 getUserMedia API
- **AI-powered image captioning** using SmolVLM model
- **Smart GPU management** with auto-start/stop functionality
- **Cost-aware processing** with daily budget limits
- **Modern responsive UI** with smooth animations
- **Real-time system monitoring** and health checks
- **Graceful error handling** and user feedback

## 🏗️ Architecture

### Frontend (This Repository)
- **HTML5** - Modern semantic markup with webcam access
- **CSS3** - Responsive design with gradient backgrounds and smooth animations
- **Vanilla JavaScript** - No frameworks, lightweight and fast
- **Deployed on**: Vercel with automatic CI/CD

### Backend API
- **Python FastAPI** - High-performance async API server
- **Redis** - Caching and request queuing
- **Nginx** - Reverse proxy and load balancing
- **Deployed on**: DigitalOcean droplet (Ubuntu 22.04)
- **API URL**: http://64.226.106.221

### AI Processing
- **SmolVLM** - State-of-the-art vision-language model
- **PyTorch** - Deep learning framework
- **Docker containers** - Scalable GPU workers
- **Deployed on**: Salad.com GPU instances

## 🚀 Live Demo

**Frontend**: https://real-time-webcam-vision-language-captioning.vercel.app
**API Docs**: http://64.226.106.221/docs
**Health Check**: http://64.226.106.221/health

## 🛠️ Local Development

### Prerequisites
- Modern web browser with webcam support
- Internet connection for API communication

### Setup
1. Clone this repository
2. Open `index.html` in your browser, or
3. Use a local server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx serve .
   
   # Live Server (VS Code extension)
   Right-click index.html -> "Open with Live Server"
   ```

### File Structure
```
webcam-captioning-app/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # Responsive CSS styles
├── js/
│   └── app.js          # JavaScript application logic
├── README.md           # Documentation
└── .gitignore          # Git ignore rules
```

## 🔧 Configuration

The app is pre-configured to connect to the production backend. To modify:

1. **API URL**: Edit `apiBaseUrl` in `js/app.js`
   ```javascript
   this.config = {
       apiBaseUrl: 'http://64.226.106.221',  // Change this URL
       maxRetries: 3,
       retryDelay: 1000
   };
   ```

2. **CORS**: Backend is configured to allow this frontend's domain

## 📱 Usage

1. **Allow camera access** when prompted
2. **Click "Start Camera"** to activate webcam
3. **Click "Take Photo"** to capture an image
4. **Click "Get AI Caption"** to process with AI
5. **Wait for results** (may take 60-90 seconds on first use)

## 🔄 API Integration

### Endpoints Used
- `GET /health` - System status and health check
- `POST /caption` - Upload image for AI captioning
- `GET /stats` - Detailed system statistics

### Response Handling
- **Success**: Display AI-generated caption
- **Starting**: Show "AI is starting up" message
- **Budget Exceeded**: Display budget limit message
- **Error**: Show user-friendly error message

## 🎨 UI Features

- **Gradient backgrounds** with modern color schemes
- **Smooth animations** and hover effects
- **Loading indicators** during AI processing
- **Responsive design** for all screen sizes
- **Status monitoring** with real-time updates
- **Error boundaries** with retry functionality

## 🔒 Security

- **HTTPS ready** for production deployment
- **Camera permissions** properly requested
- **Input validation** for image uploads
- **Error sanitization** to prevent XSS
- **CORS configured** for secure API communication

## 📊 Performance

- **Lightweight**: No external frameworks
- **Fast loading**: Minimal dependencies
- **Efficient**: Smart state management
- **Optimized images**: JPEG compression for uploads
- **Cached resources**: Browser-friendly caching

## 🐛 Troubleshooting

### Camera Issues
- Ensure camera permissions are granted
- Check if camera is being used by another app
- Try refreshing the page
- Test in an incognito/private window

### API Issues
- Check network connection
- Verify backend server status
- Try the health check endpoint
- Check browser console for errors

### Performance Issues
- Ensure stable internet connection
- Close other heavy browser tabs
- Try a different browser
- Check system resources

## 🚀 Deployment

### Vercel (Recommended)
1. Connect GitHub repository to Vercel
2. Deploy automatically on every push
3. Custom domain support available

### Other Platforms
- **Netlify**: Drag and drop deployment
- **GitHub Pages**: Static site hosting
- **Firebase Hosting**: Google Cloud integration

## 🔗 Related Repositories

- **Backend API**: DigitalOcean server configuration
- **GPU Workers**: Salad.com Docker containers
- **Infrastructure**: Redis, Nginx, systemd configs

## 📈 Monitoring

Real-time system monitoring includes:
- Backend server health
- GPU worker status
- Request queue length
- Daily cost tracking
- Processing times

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - feel free to use for personal and commercial projects.

## 📞 Support

For issues and questions:
- Check the browser console for errors
- Test the API health endpoint
- Review the troubleshooting section
- Open a GitHub issue with details

---

**Built with ❤️ using modern web technologies**