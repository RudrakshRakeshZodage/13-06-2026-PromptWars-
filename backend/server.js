const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running smoothly!' });
});

// A dummy endpoint to demonstrate API usage
app.get('/api/data', (req, res) => {
  res.json({ data: ['Item 1', 'Item 2', 'Item 3'] });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
