const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Schema, model } = mongoose;
const axios = require('axios');
const path = require('path');
const { encrypt, decrypt } = require('./encryption');
const stringSimilarity = require('string-similarity');
const didYouMean = require('didyoumean2').default;
const { transliterate } = require('transliteration');
const nspell = require('nspell');
const dictionary = require('dictionary-en');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const app = express();


const PORT = 3001;
const session = require('express-session');
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_default_secret_here',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true,
        sameSite: 'none'
    
   }
}));


// Google Gemini API key from .env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Spotify credentials from .env
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
let spotifyAccessToken = null;
let spotifyTokenExpires = 0;

// TMDB API key from .env
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// YouTube API key from .env
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Spotify API setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/callback',
});

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

app.use(cors({
  origin: 'https://myproject-vert-gamma.vercel.app', // <- update this after Vercel deploy
  credentials: true
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'frontend')));

// User schema and model
const userSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = model('User', userSchema);

// Chat schema and model
const chatSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userMessage: String,
  botResponse: String,
  timestamp: { type: Date, default: Date.now }
});
const Chat = model('Chat', chatSchema);

// Mood schema and model
const moodSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  mood: String,
  date: String, // Store as YYYY-MM-DD string
  journalEntry: String,
  journalTitle: String,
});
const Mood = model('Mood', moodSchema);

// Drawing schema and model
const drawingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  image: String, // base64 or data URL
  createdAt: { type: Date, default: Date.now }
});
const Drawing = model('Drawing', drawingSchema);

// Load English dictionary for spellchecking
let spell = null;
dictionary((err, dict) => {
  if (!err) {
    spell = nspell(dict);
  } else {
    console.error('Failed to load dictionary:', err);
  }
});

// Helper: Spellcheck and suggest corrections
function checkSpelling(input) {
  if (!spell) return input; // fallback if dictionary not loaded
  const words = input.split(/\s+/);
  const corrections = words.map(word => {
    if (!spell.correct(word)) {
      const suggestions = spell.suggest(word);
      return suggestions.length > 0 ? suggestions[0] : word;
    }
    return word;
  });
  return corrections.join(' ');
}

// Helper to get user from JWT
function getUserIdFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const userId = getUserIdFromReq(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
}

// Replace /chat endpoint with Groq's API
app.post('/chat', requireAuth, async (req, res) => {
  console.log('Received /chat request');
  const { prompt, userMessage } = req.body;
  const userId = req.userId;
  let chatHistory = await Chat.find({ userId }).sort({ timestamp: -1 }).limit(5).lean();
  chatHistory.reverse();

  let messages = [];
  if (chatHistory.length) {
    chatHistory.forEach(c => {
      messages.push({ role: 'user', content: decrypt(c.userMessage) });
      messages.push({ role: 'assistant', content: decrypt(c.botResponse) });
    });
  }
  messages.push({ role: 'user', content: userMessage });
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      },
      credentials: 'include',
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: 'You are a supportive, friendly, and helpful AI companion. Respond in a warm, natural, and emotionally intelligent way, as if you are a real human friend. Use casual, conversational language, show empathy, and add a personal touch to your replies. Avoid sounding robotic or overly formal.' },
          ...messages
        ],
        max_tokens: 100
      })
    });
    const data = await groqRes.json();
    if (!groqRes.ok || !data.choices || !data.choices[0]) {
      console.error('Groq API error:', data);
      res.status(500).json({ error: data });
      return;
    }
    const botResponse = data.choices[0].message.content;
    // Log AI reply and token usage
    const usage = data.usage || {};
    console.log('AI Response:', botResponse);
    if (usage.prompt_tokens !== undefined && usage.completion_tokens !== undefined) {
      console.log(`Tokens used - Input: ${usage.prompt_tokens}, Output: ${usage.completion_tokens}, Total: ${usage.total_tokens}`);
    } else {
      console.log('Token usage info not available in response.');
    }
    await Chat.create({ userId, userMessage: encrypt(userMessage), botResponse: encrypt(botResponse) });
    res.json({ generated_text: botResponse });
  } catch (err) {
    console.error('Server error in /chat:', err);
    res.status(500).json({ error: 'Error connecting to Groq API.', details: err.message });
  }
});
// Signup endpoint
const passwordValidator = require('password-validator');
const nodemailer = require('nodemailer');

const passwordSchema = new passwordValidator();
passwordSchema
  .is().min(8)
  .is().max(100)
  .has().uppercase()
  .has().lowercase()
  .has().digits()
  .has().not().spaces();

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  console.log('Received signup request with email:', email, 'and password:', password);

  if (!email || !password) {
    console.log('Error: Email and password are required.');
    return res.status(400).json({ error: 'Email and password required.' });
  }

  if (!passwordSchema.validate(password)) {
    console.log('Error: Password does not meet requirements.');
    return res.status(400).json({ error: 'Password must meet the following requirements: at least 8 characters, at least one uppercase letter, at least one lowercase letter, at least one number, and no spaces.' });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      console.log('Error: Email already registered.');
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Generate a 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000);
    console.log('Session ID (signup):', req.sessionID);
    console.log('Generated OTP:', otp);
    const now = Date.now();
      if (req.session.lastOtpTime && now - req.session.lastOtpTime < 2 * 60 * 1000) {
       const remaining = Math.ceil((2 * 60 * 1000 - (now - req.session.lastOtpTime)) / 1000);
      return res.status(429).json({ error: `Please wait ${remaining} seconds before requesting another OTP.` });
    }

    req.session.otp = otp;
    req.session.email = email;
    req.session.password = password;
    req.session.lastOtpTime = now; // ✅ set new cooldown marker
    const user = new User({ email, password });

    

        // Send the OTP to the user's email
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // or 'STARTTLS'
      auth: {
        user: 'safespacefeedback@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: 'your-email@gmail.com',
      to: email,
      subject: 'Verify your email address',
      text: `Your OTP is: ${otp}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Error sending OTP:', error);
        return res.status(500).json({ error: 'Failed to send OTP' });
      }

      console.log('OTP sent successfully:', info);
      // Store the OTP in the user's session
      //req.session.otp = otp;
      // Return a response to the client
      res.status(200).json({ message: 'OTP sent to your email' });

    });
  } catch (err) {
    console.log('Error during signup:', err);
    res.status(500).json({ error: 'Signup failed.' });
  }
});

// Verify OTP endpoint
app.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;

  console.log('Session ID (verify-otp):', req.sessionID);
  console.log('Stored OTP on server:', req.session.otp);
  console.log('Received OTP from client:', otp);
  

  if (!otp) {
    return res.status(400).json({ error: 'OTP required' });
  }
  if (String(otp) !== String(req.session.otp)) {
    return res.status(401).json({ error: 'Invalid OTP' });
  }

  // ✅ Use session-stored credentials
  const email = req.session.email;
  const password = req.session.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'Session expired. Please sign up again.' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ email, password: hashed });
  console.log('User account created successfully.');

  res.json({ message: 'Account created successfully' });
});


// Login endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Log a mood (always tied to logged-in user)
app.post('/mood', requireAuth, async (req, res) => {
  const { mood, date, journalEntry, journalTitle } = req.body;
  if (!mood) return res.status(400).json({ error: 'Mood is required.' });
  if (!date || date.length !== 10) return res.status(400).json({ error: 'Date is required and must be YYYY-MM-DD.' });
  await Mood.deleteMany({ userId: req.userId, date });
  const entry = await Mood.create({
    userId: req.userId,
    mood: encrypt(mood),
    date,
    journalEntry: journalEntry ? encrypt(journalEntry) : '',
    journalTitle: journalTitle ? encrypt(journalTitle) : ''
  });
  res.status(201).json(entry);
});

// Get mood history (only for logged-in user)
app.get('/mood', requireAuth, async (req, res) => {
  const moods = await Mood.find({ userId: req.userId }).sort({ date: -1 });
  // Decrypt sensitive fields before sending
  const decryptedMoods = moods.map(m => ({
    ...m.toObject(),
    mood: m.mood ? decrypt(m.mood) : '',
    journalEntry: m.journalEntry ? decrypt(m.journalEntry) : '',
    journalTitle: m.journalTitle ? decrypt(m.journalTitle) : ''
  }));
  res.json(decryptedMoods);
});

// Get profile
app.get('/profile', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  const moodCount = await Mood.countDocuments({ userId: req.userId });
  const chatCount = await Chat.countDocuments({ userId: req.userId });
  res.json({
    email: user.email,
    moodCount,
    chatCount
  });
});

// Get user chat history (last 20 messages)
app.get('/profile/chats', requireAuth, async (req, res) => {
  const chats = await Chat.find({ userId: req.userId })
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();
  // Decrypt chat fields
  const decryptedChats = chats.map(c => ({
    ...c,
    userMessage: c.userMessage ? decrypt(c.userMessage) : '',
    botResponse: c.botResponse ? decrypt(c.botResponse) : ''
  }));
  res.json(decryptedChats);
});

// Save a drawing
app.post('/drawings', requireAuth, async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'Image required.' });

  // Check if user has already saved 3 drawings
  const userDrawings = await Drawing.find({ userId: req.userId });
  if (userDrawings.length >= 3) {
    return res.status(400).json({ error: 'You have already saved 3 drawings. Please delete one before saving a new one.' });
  }

  const drawing = await Drawing.create({ userId: req.userId, image });
  res.status(201).json(drawing);
});
// Get all drawings for user
app.get('/drawings', requireAuth, async (req, res) => {
  const drawings = await Drawing.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json(drawings);
});

// Delete a drawing
app.delete('/drawings/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const drawing = await Drawing.findOneAndDelete({ _id: id, userId: req.userId });
  if (!drawing) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// Helper: Get Spotify access token (Client Credentials Flow)
async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyAccessToken && now < spotifyTokenExpires) {
    return spotifyAccessToken;
  }
  const resp = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
    }
  );
  spotifyAccessToken = resp.data.access_token;
  spotifyTokenExpires = now + resp.data.expires_in * 1000 - 60000; // 1 min early
  return spotifyAccessToken;
}

// Helper: Use Gemini to extract structured info from prompt
async function extractInfoWithGemini(prompt, type) {
  // type: 'music' or 'movie'
  const systemPrompt = type === 'music'
    ? `Extract the following from the user's request for a playlist: genre, mood, artist, decade, language. Respond as a JSON object with keys: genre, mood, artist, decade, language. If not specified, use null.`
    : `Extract the following from the user's request for a movie or series: genre, decade, language, keywords. Respond as a JSON object with keys: genre, decade, language, keywords. If not specified, use null.`;
  const body = {
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\nUser: ${prompt}` }] }
    ]
  };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=' + GEMINI_API_KEY;
  try {
    const resp = await axios.post(url, body);
    const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    // Try to parse JSON from Gemini's response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return {};
  } catch (err) {
    console.error('Gemini extraction error:', err.response?.data || err.message);
    return {};
  }
}

// Route: GET /recommend/songs?prompt=...
app.get('/recommend/songs', async (req, res) => {
  try {
    const prompt = req.query.mood || req.query.prompt || '';
    let genre = req.query.genre || '';
    let artist = req.query.artist || '';
    let mood = req.query.mood || '';
    let decade = '';
    let language = '';
    // Use Gemini to extract info if prompt is provided
    if (prompt) {
      const info = await extractInfoWithGemini(prompt, 'music');
      genre = info.genre || genre;
      artist = info.artist || artist;
      mood = info.mood || mood;
      decade = info.decade || '';
      language = info.language || '';
    }
    const token = await getSpotifyAccessToken();
    let q = '';
    if (mood) q += ` ${mood}`;
    if (genre) q += ` genre:${genre}`;
    if (artist) q += ` artist:${artist}`;
    if (language) q += ` language:${language}`;
    if (decade) q += ` year:${decade}`;
    q = q.trim();
    // Search for tracks
    const searchResp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: q || 'pop',
        type: 'track',
        limit: 10,
      },
    });
    const tracks = searchResp.data.tracks.items.map((track) => ({
      name: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album.name,
      url: track.external_urls.spotify,
      preview_url: track.preview_url,
      image: track.album.images[0]?.url,
    }));
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch songs', details: err.message });
  }
});

// Route: GET /recommend/movies?prompt=...
app.get('/recommend/movies', async (req, res) => {
  try {
    const prompt = req.query.genre || req.query.query || req.query.prompt || '';
    let genre = req.query.genre || '';
    let query = req.query.query || '';
    let decade = '';
    let language = '';
    let keywords = '';
    // Use Gemini to extract info if prompt is provided
    if (prompt) {
      const info = await extractInfoWithGemini(prompt, 'movie');
      genre = info.genre || genre;
      decade = info.decade || '';
      language = info.language || '';
      keywords = info.keywords || '';
      query = keywords || query;
    }
    let url = `https://api.themoviedb.org/3/discover/movie`;
    let params = {
      api_key: TMDB_API_KEY,
      sort_by: 'popularity.desc',
      page: 1,
    };
    if (genre) {
      // Get genre ID from TMDB
      const genreResp = await axios.get(
        `https://api.themoviedb.org/3/genre/movie/list`,
        { params: { api_key: TMDB_API_KEY } }
      );
      const found = genreResp.data.genres.find(
        (g) => g.name.toLowerCase() === genre.toLowerCase()
      );
      if (found) params.with_genres = found.id;
    }
    if (query) {
      // Use search endpoint if query is provided
      url = 'https://api.themoviedb.org/3/search/movie';
      params.query = query;
    }
    if (language) params.with_original_language = language;
    const movieResp = await axios.get(url, { params });
    const movies = movieResp.data.results.slice(0, 10).map((movie) => ({
      title: movie.title,
      overview: movie.overview,
      release_date: movie.release_date,
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null,
      vote_average: movie.vote_average,
      id: movie.id,
    }));
    res.json({ movies });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movies', details: err.message });
  }
});

// Helper: Verify a song/artist using Spotify API
async function verifySongWithSpotify(songName, artistName) {
  try {
    const token = await getSpotifyAccessToken();
    const q = `${songName} artist:${artistName}`;
    const resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q,
        type: 'track',
        limit: 1,
      },
    });
    const items = resp.data.tracks.items;
    if (items && items.length > 0) {
      const track = items[0];
      // Check if artist matches (case-insensitive, partial match allowed)
      const foundArtist = track.artists.find(a => a.name.toLowerCase().includes(artistName.toLowerCase()));
      if (foundArtist) {
        return {
          name: track.name,
          artist: foundArtist.name,
          url: track.external_urls.spotify,
          cover: track.album.images[0]?.url || 'https://placehold.co/48x48?text=Music',
        };
      }
    }
    return null;
  } catch (err) {
    console.error('Spotify verification error:', err.message);
    return null;
  }
}

// Helper: Build a Spotify search query from filters, skipping empty/none values
function buildSpotifyQuery({ mood, genre, activity, artists, songs }) {
  let q = '';
  if (mood) q += ` ${mood}`;
  if (genre) q += ` genre:${genre}`;
  if (activity) q += ` ${activity}`;
  if (artists && artists.length > 0 && artists[0].toLowerCase() !== 'none') {
    q += ' ' + artists.filter(a => a && a.toLowerCase() !== 'none').map(a => `artist:${a}`).join(' ');
  }
  if (songs && songs.length > 0 && songs[0].toLowerCase() !== 'none') {
    q += ' ' + songs.filter(s => s && s.toLowerCase() !== 'none').map(s => `track:${s}`).join(' ');
  }
  return q.trim();
}

// Helper: Detect if a string is likely Hindi (Devanagari script or common keywords)
function isHindiText(text) {
  // Check for Devanagari Unicode range or common Hindi/Bollywood keywords
  return /[\u0900-\u097F]/.test(text) ||
    /hindi|bollywood|arijit|armaan|shreya|jubin|neha|yo yo honey|badshah|kk|atif|kumar sanu|udit|kailash|sonu nigam|shankar mahadevan|sunidhi|palak|shilpa rao|vishal mishra|prateek kuhad|seedhe mauth|divine|emiway|raftaar|darshan raval|ankit tiwari|kanika kapoor|guru randhawa|diljit dosanjh|b praak|jass manak|steve benjamin|jubin nautiyal|tulsi kumar|payal dev|parampara|sachet|sachet-parampara|vishal-shekhar|salim-sulaiman|mithoon|jeet ganguli|papon|shalmali|jonita gandhi|monali thakur|shashwat|shashaa|shashwat singh|shashaa tirupati|shashwat sachdev|shashwat sachdev|shashwat sachdev|shashwat sachdev/i.test(text.toLowerCase());
}

// Helper: YouTube Data API fallback for top songs (broad, no artist, no 'music video')
async function getYouTubeFallbackTracks({ mood, genre, artists }, forceHindi = false) {
  let q = forceHindi ? 'top Hindi ' : 'top ';
  if (genre) q += genre + ' ';
  if (mood) q += mood + ' ';
  // Do NOT include artist or 'official music video'
  q += 'songs';
  const apiKey = YOUTUBE_API_KEY;
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(q)}&key=${apiKey}`;
  try {
    const searchResp = await axios.get(searchUrl);
    const items = searchResp.data.items || [];
    const videoIds = items.map(item => item.id.videoId).join(',');
    if (!videoIds) return [];
    // Fetch video details for duration and category
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${apiKey}`;
    const detailsResp = await axios.get(detailsUrl);
    const details = detailsResp.data.items || [];
    // Helper to parse ISO 8601 duration to seconds
    function parseDuration(iso) {
      const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const hours = parseInt(match[1] || '0', 10);
      const minutes = parseInt(match[2] || '0', 10);
      const seconds = parseInt(match[3] || '0', 10);
      return hours * 3600 + minutes * 60 + seconds;
    }
    // Filter: only music category, ≤ 7 min, exclude obvious junk
    const filtered = details.filter(item => {
      const duration = parseDuration(item.contentDetails.duration);
      const title = item.snippet.title.toLowerCase();
      const categoryId = item.snippet.categoryId || item.categoryId;
      // Only include music category
      if (categoryId !== '10') return false;
      // Exclude if longer than 7 min
      if (duration > 420) return false;
      // Exclude if title contains obvious non-music/junk keywords
      if (
        title.includes('interview') ||
        title.includes('vlog') ||
        title.includes('shorts') ||
        title.includes('trailer') ||
        title.includes('teaser') ||
        title.includes('episode') ||
        title.includes('scene') ||
        title.includes('review') ||
        title.includes('reaction')
      ) return false;
      return true;
    });
    return filtered.map(item => ({
      name: item.snippet.title,
      artist: item.snippet.channelTitle,
      url: `https://www.youtube.com/watch?v=${item.id}`
    }));
  } catch (err) {
    console.error('YouTube fallback error:', err.message);
    return [];
  }
}

app.post('/playlist-quiz', requireAuth, async (req, res) => {
  let { mood, genre, activity, favoriteArtist, repeatSong } = req.body;
  let artists = favoriteArtist ? favoriteArtist.split(',').map(a => a.trim()).filter(Boolean) : [];
  let songs = repeatSong ? repeatSong.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Strict AI prompt for real discography results
  const prompt = `You are a music expert and playlist curator. Given these answers:\n- Mood: ${mood}\n- Genre: ${genre}\n- Activity: ${activity}\n- Favorite Artists: ${artists.join(', ') || 'None'}\n- Songs on repeat: ${songs.join(', ') || 'None'}\n\nPlease recommend a playlist of 20 real songs (minimum 10, but aim for 20) that fit this profile. If artists are provided, recommend only real songs from their actual discographies. If no artist is provided, recommend real songs from the specified genre or mood. Do not invent or guess song/artist names. Respond as a JSON object with two keys:\n- 'comment' (a positive, sarcastic comment about the user's music taste, 1-2 sentences)\n- 'playlist' (an array of objects with keys: name, artist)`;

  // Helper: Try multiple search strategies and fuzzy/transliteration matching
  async function findSpotifyTrack(trackName, artistName, token) {
    let tried = [];
    let log = [];
    // 1. Try exact match (track + artist)
    let q = `track:${trackName} artist:${artistName}`;
    let resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: 'track', limit: 5 }
    });
    let items = resp.data.tracks.items;
    tried.push(q);
    if (items && items.length > 0) {
      // Fuzzy match on artist name
      const artistNames = items.map(t => t.artists.map(a => a.name).join(', '));
      const bestArtist = didYouMean(artistName, artistNames);
      const found = items.find(t => t.artists.map(a => a.name).join(', ') === bestArtist);
      if (found) return { found, log: [`exact+fuzzy artist: ${bestArtist}`] };
    }
    // 2. Try just artist
    q = `artist:${artistName}`;
    resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: 'artist', limit: 5 }
    });
    let artistItems = resp.data.artists.items;
    tried.push(q);
    if (artistItems && artistItems.length > 0) {
      // Fuzzy match on artist
      const artistNames = artistItems.map(a => a.name);
      const bestArtist = didYouMean(artistName, artistNames);
      const foundArtist = artistItems.find(a => a.name === bestArtist);
      if (foundArtist) {
        // Get top tracks for this artist
        const topResp = await axios.get(`https://api.spotify.com/v1/artists/${foundArtist.id}/top-tracks`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { market: 'IN' }
        });
        if (topResp.data.tracks && topResp.data.tracks.length > 0) {
          return { found: topResp.data.tracks[0], log: [`artist top track: ${bestArtist}`] };
        }
      }
    }
    // 3. Try just track name
    q = `track:${trackName}`;
    resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: 'track', limit: 5 }
    });
    items = resp.data.tracks.items;
    tried.push(q);
    if (items && items.length > 0) {
      // Fuzzy match on track name
      const trackNames = items.map(t => t.name);
      const bestTrack = didYouMean(trackName, trackNames);
      const found = items.find(t => t.name === bestTrack);
      if (found) return { found, log: [`track fuzzy: ${bestTrack}`] };
    }
    // 4. Try transliterated artist/track
    const translitArtist = transliterate(artistName);
    const translitTrack = transliterate(trackName);
    if (translitArtist !== artistName || translitTrack !== trackName) {
      // Try transliterated search
      q = `track:${translitTrack} artist:${translitArtist}`;
      resp = await axios.get('https://api.spotify.com/v1/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q, type: 'track', limit: 5 }
      });
      items = resp.data.tracks.items;
      tried.push(q);
      if (items && items.length > 0) {
        return { found: items[0], log: ['transliterated'] };
      }
    }
    // 5. Try partials (first word)
    const firstArtist = artistName.split(' ')[0];
    const firstTrack = trackName.split(' ')[0];
    q = `track:${firstTrack} artist:${firstArtist}`;
    resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: 'track', limit: 5 }
    });
    items = resp.data.tracks.items;
    tried.push(q);
    if (items && items.length > 0) {
      return { found: items[0], log: ['partial'] };
    }
    // 6. Placeholder: Try other APIs (future)
    // TODO: Integrate JioSaavn, Gaana, etc. for better Indian music coverage
    // 7. Log failure
    log.push(`FAILED: ${trackName} by ${artistName} | Tried: ${tried.join(' | ')}`);
    return { found: null, log };
  }
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      Credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: 'You are a music expert and playlist curator.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 700
      })
    });
    const aiData = await aiRes.json();
    let comment = '';
    let tracks = [];
    let debug = '';
    try {
      const text = aiData.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(text);
      comment = parsed.comment || '';
      tracks = parsed.playlist || [];
      debug = 'Parsed AI response as JSON.';
    } catch (e) {
      // fallback: try to extract JSON from text
      const text = aiData.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          comment = parsed.comment || '';
          tracks = parsed.playlist || [];
          debug = 'Extracted JSON from AI response fallback.';
        } catch (err2) {
          debug = 'Failed to parse JSON from AI response fallback.';
        }
      } else {
        debug = 'No JSON found in AI response.';
      }
    }

    // Now verify each track with Spotify, using fuzzy/transliteration matching
    const verifiedTracks = [];
    const failedMatches = [];
    const token = await getSpotifyAccessToken();
    for (const track of tracks) {
      if (!track.name || !track.artist) continue;
      const { found, log: matchLog } = await findSpotifyTrack(track.name, track.artist, token);
      if (found) {
        verifiedTracks.push({
          name: found.name,
          artist: found.artists.map(a => a.name).join(', '),
          url: found.external_urls.spotify
        });
      } else {
        failedMatches.push({ name: track.name, artist: track.artist, log: matchLog });
      }
      if (verifiedTracks.length >= 20) break;
    }

    // If fewer than 10, fill with genre/mood-based Spotify recommendations
    if (verifiedTracks.length < 10) {
      let q = '';
      if (mood) q += ` ${mood}`;
      if (genre) q += ` genre:${genre}`;
      if (activity) q += ` ${activity}`;
      q = q.trim() || 'pop';
      const resp = await axios.get('https://api.spotify.com/v1/search', {
        headers: { Authorization: `Bearer ${token}` },
        params: { q, type: 'track', limit: 20 - verifiedTracks.length }
      });
      for (const found of resp.data.tracks.items) {
        verifiedTracks.push({
          name: found.name,
          artist: found.artists.map(a => a.name).join(', '),
          url: found.external_urls.spotify
        });
        if (verifiedTracks.length >= 20) break;
      }
    }
    // If still fewer than 10, use YouTube fallback
    let ytTracks = [];
    let hindiTracks = [];
    let needHindi = false;
    // Detect Hindi preference from user answers
    if (
      (genre && isHindiText(genre)) ||
      (mood && isHindiText(mood)) ||
      (artists && artists.some(isHindiText))
    ) {
      needHindi = true;
    }
    ytTracks = await getYouTubeFallbackTracks({ mood, genre, artists });
    // If Hindi preference, fetch Hindi tracks and ensure at least 8
    if (needHindi) {
      hindiTracks = await getYouTubeFallbackTracks({ mood, genre, artists }, true);
      // Filter for Hindi by script/keywords
      hindiTracks = hindiTracks.filter(t => isHindiText(t.name) || isHindiText(t.artist));
      // Ensure at least 8 Hindi tracks in the playlist
      let count = 0;
      for (const t of hindiTracks) {
        if (verifiedTracks.length >= 20) break;
        if (!verifiedTracks.find(v => v.url === t.url)) {
          verifiedTracks.push(t);
          count++;
        }
        if (count >= 8) break;
      }
    }
    // Fill up to 20 with the rest of ytTracks
    for (const t of ytTracks) {
      if (verifiedTracks.length >= 20) break;
      if (!verifiedTracks.find(v => v.url === t.url)) {
        verifiedTracks.push(t);
      }
    }
    // Log all failed matches for analysis
    if (failedMatches.length > 0) {
      console.log('Failed to match the following tracks:', failedMatches);
    }
    // Only return up to 20
    res.json({ comment, tracks: verifiedTracks.slice(0, 20), debug, failedMatches });
  } catch (err) {
    console.error('Playlist Quiz Error:', err);
    res.status(500).json({ error: 'Could not generate playlist', details: err.message, debug: 'Exception thrown in /playlist-quiz endpoint.' });
  }
});

// 1. Spotify Login
app.get('/login', (req, res) => {
  const scopes = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-read-private',
    'user-read-email',
  ];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'state');
  res.redirect(authorizeURL);
});

// 2. Spotify OAuth Callback
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body['access_token']);
    spotifyApi.setRefreshToken(data.body['refresh_token']);
    res.redirect('/frontend/index.html?auth=success');
  } catch (err) {
    res.status(400).send('Authentication failed');
  }
});

// 3. Get User Profile
app.get('/user-profile', async (req, res) => {
  try {
    const data = await spotifyApi.getMe();
    res.json(data.body);
  } catch (err) {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// 4. Generate Playlist
app.post('/generate-playlist', async (req, res) => {
  try {
    let { mood, genres, activities, playlistName } = req.body;
    // Spellcheck user input
    mood = checkSpelling(mood || '');
    genres = checkSpelling(genres || '');
    activities = checkSpelling(activities || '');
    playlistName = checkSpelling(playlistName || 'My Playlist');

    // Search for tracks based on mood/genre/activity
    const query = [mood, genres, activities].filter(Boolean).join(' ');
    const searchRes = await spotifyApi.searchTracks(query, { limit: 20 });
    const trackUris = searchRes.body.tracks.items.map(t => t.uri);

    // Create playlist
    const user = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(user.body.id, playlistName, { public: false });
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);

    res.json({
      playlistUrl: playlist.body.external_urls.spotify,
      corrected: { mood, genres, activities, playlistName },
      tracks: searchRes.body.tracks.items.map(t => ({
        name: t.name,
        artist: t.artists[0].name,
        album: t.album.name,
        preview_url: t.preview_url,
        image: t.album.images[0]?.url,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate playlist', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Relay server running on http://localhost:${PORT}`);
}); 