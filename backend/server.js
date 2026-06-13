const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { generateWellnessResponse, analyzeJournalEntry } = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 5000;

// Security HTTP Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss: ws: https:; frame-src https://www.youtube.com; img-src 'self' data: https://images.unsplash.com https://media.giphy.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  next();
});

// Create HTTP server to share with WebSocket
const server = http.createServer(app);

// Initialize WebSocket Server on /socket path
const wss = new WebSocket.Server({ noServer: true });

// Setup Rate Limiting for security
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

// Apply rate limiting to all api endpoints
app.use('/api/', apiLimiter);

const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  'https://swasthya.vercel.app',
  /\.vercel\.app$/
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    if (isAllowed) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// REST API Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Swasthya Backend is running smoothly!' });
});

// REST API endpoint for wellness companion processing (fallback for WebSockets)
app.post('/api/wellness', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text input is required' });
    }

    const response = await generateWellnessResponse(text);
    return res.json(response);
  } catch (error) {
    console.error('Error processing wellness request:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// REST API endpoint for journaling analysis
app.post('/api/journal', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text input is required' });
    }

    const analysis = await analyzeJournalEntry(text);
    return res.json(analysis);
  } catch (error) {
    console.error('Error processing journal request:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Handle upgrade from HTTP to WebSocket
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/socket') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket Server Connection Handler
wss.on('connection', (ws) => {
  console.log('New real-time client connected to Swasthya');
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Send initial handshakes
  ws.send(JSON.stringify({ 
    type: 'connection_established', 
    message: 'Welcome to Swasthya Vocal/Visual Engine.' 
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'user_speech':
          console.log('Received voice transcription:', data.text);
          // 1. Process voice message using our AI service (which sanitizes input)
          const response = await generateWellnessResponse(data.text);
          
          // 2. Respond in real-time with echo transcript
          ws.send(JSON.stringify({
            type: 'wellness_response',
            data: response,
            user_text: data.text
          }));
          break;

        case 'webrtc_signaling':
          // Standard signaling echo for Peer-to-Peer or WebRTC streams
          // Echo signaling payload (SDP offer/answer or ICE candidate) to other peers
          console.log('WebRTC signaling event received:', data.payload.type);
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'webrtc_signaling',
                payload: data.payload
              }));
            }
          });
          break;

        default:
          console.warn('Unknown WebSocket message type:', data.type);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from Swasthya');
  });
});

// Periodic heartbeat clean up for stale sockets (Efficiency)
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating stale WebSocket connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start listening if run directly, otherwise export app for supertest
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Swasthya backend server running on port ${PORT}`);
  });
}

module.exports = app;
