const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { generateWellnessResponse, analyzeJournalEntry } = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 5000;

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

app.use(cors());
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
          
          // 2. Respond in real-time
          ws.send(JSON.stringify({
            type: 'wellness_response',
            data: response
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

server.listen(PORT, () => {
  console.log(`Swasthya backend server running on port ${PORT}`);
});
