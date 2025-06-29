let allMoods = [];

// Mood Log Logic (user-specific, fetch from backend)
if (document.getElementById('moodForm')) {
  const moodForm = document.getElementById('moodForm');
  const moodSelect = document.getElementById('moodSelect');
  const moodEntries = document.getElementById('moodEntries');
  const moodDate = document.getElementById('moodDate');
  const journalTitle = document.getElementById('journalTitle');
  const journalEntry = document.getElementById('journalEntry');
  const journalEntriesSection = document.getElementById('journalEntriesSection');

  let fp = null;

  async function loadMoods() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch('http://localhost:3001/mood', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    allMoods = await res.json();
    renderMoods();
    markMoodDays();
  }

  function renderMoods() {
    moodEntries.innerHTML = '';
  }

  function markMoodDays() {
    if (!fp) return;
    // Get unique dates with moods
    const moodDates = Array.from(new Set(allMoods.map(entry => entry.date && entry.date.slice(0, 10))));
    setTimeout(() => {
      document.querySelectorAll('.flatpickr-day').forEach(day => {
        const date = day.dateObj ? day.dateObj.toISOString().slice(0, 10) : null;
        if (date && moodDates.includes(date)) {
          day.classList.add('has-mood');
        } else {
          day.classList.remove('has-mood');
        }
      });
    }, 10);
  }

  // Set default date to today on page load
  if (moodDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    moodDate.value = todayStr;
  }

  let pendingMoodLog = null;

  // Utility to get local date string (YYYY-MM-DD) in device's timezone
  function getLocalDateString() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  moodForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    // Ensure all required elements exist
    if (!moodSelect || !journalTitle || !journalEntry) {
      console.log('Missing form elements:', { moodSelect, journalTitle, journalEntry });
      return;
    }
    console.log('Submitting mood:', {
      mood: moodSelect.value,
      journalTitle: journalTitle.value,
      journalEntry: journalEntry.value
    });
    const mood = moodSelect.value;
    // Always use device's current local date for logging
    const date = getLocalDateString();
    // Only allow logging for today
    const today = new Date();
    today.setHours(0,0,0,0);
    const selected = new Date(date);
    selected.setHours(0,0,0,0);
    if (selected.getTime() !== today.getTime()) {
      alert('You can only log or edit your mood for today.');
      if (moodDate) moodDate.value = date;
      return;
    }
    // If editing today's log, show confirmation modal
    const existingMood = allMoods.find(e => e.date && e.date.slice(0,10) === date);
    if (existingMood) {
      pendingMoodLog = { mood, date };
      document.getElementById('editConfirmModal').style.display = 'flex';
      return;
    }
    const journalTitleVal = journalTitle && journalTitle.value ? journalTitle.value.trim() : '';
    const journalEntryVal = journalEntry && journalEntry.value ? journalEntry.value.trim() : '';
    if (!mood) {
      console.log('No mood selected.');
      return;
    }
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:3001/mood', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ mood, date, journalTitle: journalTitleVal, journalEntry: journalEntryVal })
      });
      const result = await response.json();
      console.log('Mood log response:', result);
    } catch (err) {
      console.error('Error logging mood:', err);
    }
    localStorage.removeItem('journalDraft-' + date);
    moodForm.reset();
    loadMoods();
    // Show popup
    const popup = document.getElementById('moodLoggedPopup');
    if (popup) {
      popup.style.display = 'block';
      setTimeout(() => {
        popup.style.display = 'none';
        window.location.href = 'mood-history.html';
      }, 1200);
    } else {
      window.location.href = 'mood-history.html';
    }
  });

  // Modal logic
  const editConfirmYes = document.getElementById('editConfirmYes');
  const editConfirmNo = document.getElementById('editConfirmNo');
  if (editConfirmYes && editConfirmNo) {
    editConfirmYes.onclick = async function() {
      if (!pendingMoodLog) return;
      const { mood, date } = pendingMoodLog;
      const journalTitleVal = journalTitle && journalTitle.value ? journalTitle.value.trim() : '';
      const journalEntryVal = journalEntry && journalEntry.value ? journalEntry.value.trim() : '';
      const token = localStorage.getItem('token');
      await fetch('http://localhost:3001/mood', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ mood, date, journalTitle: journalTitleVal, journalEntry: journalEntryVal })
      });
      localStorage.removeItem('journalDraft-' + date);
      moodForm.reset();
      loadMoods();
      document.getElementById('editConfirmModal').style.display = 'none';
      pendingMoodLog = null;
      // Show popup
      const popup = document.getElementById('moodLoggedPopup');
      if (popup) {
        popup.style.display = 'block';
        setTimeout(() => { popup.style.display = 'none'; }, 2000);
      }
    };
    editConfirmNo.onclick = function() {
      document.getElementById('editConfirmModal').style.display = 'none';
      pendingMoodLog = null;
      if (moodDate) moodDate.value = new Date().toISOString().slice(0, 10);
    };
  }

  // Autosave drafts for all fields
  [journalTitle, journalEntry].forEach(el => {
    if (el) el.addEventListener('input', () => {
      const date = moodDate && moodDate.value ? moodDate.value : new Date().toISOString().slice(0, 10);
      localStorage.setItem('journalDraft-' + date, JSON.stringify({
        journalTitle: journalTitle && journalTitle.value ? journalTitle.value : '',
        journalEntry: journalEntry && journalEntry.value ? journalEntry.value : ''
      }));
    });
  });

  // Load draft if exists
  function loadJournalDraft() {
    const date = moodDate.value || new Date().toISOString().slice(0, 10);
    const draft = localStorage.getItem('journalDraft-' + date);
    if (draft) {
      const { journalTitle, journalEntry } = JSON.parse(draft);
      journalTitle.value = journalTitle || '';
      journalEntry.value = journalEntry || '';
    } else {
      journalTitle.value = '';
      journalEntry.value = '';
    }
  }

  // Prefill all fields if data exists for date
  function prefillForDate() {
    const date = moodDate.value || new Date().toISOString().slice(0, 10);
    const moodObj = allMoods.find(e => e.date && e.date.slice(0, 10) === date);
    if (moodObj) {
      moodSelect.value = moodObj.mood || '';
      journalTitle.value = moodObj.journalTitle || '';
      journalEntry.value = moodObj.journalEntry || '';
    } else {
      loadJournalDraft();
    }
  }

  if (moodDate) {
    moodDate.addEventListener('change', () => {
      renderMoods();
      prefillForDate();
    });
  }

  // Journal Section Elements
  const toggleJournalBtn = document.getElementById('toggleJournalBtn');
  const journalSection = document.getElementById('journalSection');
  const saveJournalBtn = document.getElementById('saveJournalBtn');

  // Toggle journal section
  if (toggleJournalBtn && journalSection) {
    toggleJournalBtn.onclick = () => {
      journalSection.style.display = journalSection.style.display === 'none' ? 'flex' : 'none';
    };
  }

  // Render past journal entries
  function renderJournalEntries() {
    if (!journalEntriesSection) return;
    let html = '';
    // Filter: show only entries with journalEntry
    const entries = allMoods.filter(e => e.journalEntry && e.journalEntry.length > 0);
    if (!entries.length) {
      html = '<p style="color:#888">No journal entries yet.</p>';
    } else {
      html = '<ul style="list-style:none;padding:0;">' + entries.map(e => {
        const date = new Date(e.date).toLocaleDateString();
        return `<li style='background:#f0f1fa;margin-bottom:0.7rem;padding:0.9rem 1.2rem;border-radius:10px;box-shadow:0 2px 8px rgba(76,70,255,0.04);'>
          <strong>${date}</strong> ${e.mood ? `<span style='color:#6c63ff;'>[${e.mood}]</span>` : ''}<br>
          <span style='font-weight:600;'>${e.journalTitle ? e.journalTitle + ': ' : ''}</span>
          <span>${e.journalEntry.length > 120 ? e.journalEntry.slice(0,120)+'...' : e.journalEntry}</span>
        </li>`;
      }).join('') + '</ul>';
    }
    journalEntriesSection.innerHTML = html;
  }

  // Initial load
  loadMoods();
}

// Mood History Modal logic
if (
  document.getElementById('viewMoodHistoryBtn') &&
  document.getElementById('moodHistoryModal') &&
  document.getElementById('closeMoodHistory') &&
  document.getElementById('moodHistoryList')
) {
  const viewMoodHistoryBtn = document.getElementById('viewMoodHistoryBtn');
  const moodHistoryModal = document.getElementById('moodHistoryModal');
  const closeMoodHistory = document.getElementById('closeMoodHistory');
  const moodHistoryList = document.getElementById('moodHistoryList');

  viewMoodHistoryBtn.onclick = async function() {
    // Fetch latest moods before showing modal
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch('http://localhost:3001/mood', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    allMoods = await res.json();
    moodHistoryList.innerHTML = '';
    allMoods.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(entry => {
      const date = new Date(entry.date).toLocaleDateString();
      moodHistoryList.innerHTML += `<li><span>${date} - <strong>${entry.mood}</strong></span></li>`;
    });
    moodHistoryModal.style.display = 'block';
  };
  closeMoodHistory.onclick = function() {
    moodHistoryModal.style.display = 'none';
  };
  // Optional: close modal when clicking outside content
  window.onclick = function(event) {
    if (event.target === moodHistoryModal) {
      moodHistoryModal.style.display = 'none';
    }
  };
}

// Playlist Quiz Logic (for both index.html and chat.html)
function initPlaylistQuiz() {
  const openBtn = document.getElementById('openPlaylistQuizBtn');
  if (!openBtn) return;
  openBtn.onclick = () => {
    const modal = document.getElementById('playlistQuizModal');
    const closeBtn = document.getElementById('closePlaylistQuizModal');
    const quizContainer = document.getElementById('playlistQuizContainer');
    const resultContainer = document.getElementById('playlistQuizResult');
    if (!modal || !closeBtn || !quizContainer || !resultContainer) return;

    const quizQuestions = [
      {
        question: "How are you feeling right now?",
        type: "select",
        options: ["Happy", "Sad", "Energetic", "Relaxed", "Anxious", "Motivated", "Calm", "Excited"]
      },
      {
        question: "What genre of music do you enjoy the most?",
        type: "select",
        options: ["Pop", "Rock", "Hip-Hop", "Jazz", "Classical", "EDM", "Indie", "Country", "R&B", "Metal"]
      },
      {
        question: "Which activity are you doing while listening?",
        type: "select",
        options: ["Studying", "Working out", "Chilling", "Partying", "Commuting", "Cooking", "Reading", "Gaming"]
      },
      {
        question: "Your favorite artists (separated by commas)",
        type: "text",
        placeholder: "e.g. Taylor Swift, Drake, BTS"
      },
      {
        question: "Songs you've had on repeat (separated by commas)",
        type: "text",
        placeholder: "e.g. Blinding Lights, Shape of You"
      }
    ];
    let currentStep = 0;
    const answers = [];

    function renderQuizStep() {
      quizContainer.innerHTML = '';
      // Progress bar
      const progress = ((currentStep) / quizQuestions.length) * 100;
      quizContainer.innerHTML += `<div class='premium-quiz-progress'><div class='premium-quiz-progress-bar' style='width:${progress}%;'></div></div>`;
      if (currentStep < quizQuestions.length) {
        const q = quizQuestions[currentStep];
        const qDiv = document.createElement('div');
        qDiv.className = 'premium-quiz-card';
        qDiv.innerHTML = `<h3>${q.question}</h3>`;
        let input;
        if (q.type === 'select') {
          input = document.createElement('select');
          input.className = 'quiz-select';
          q.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            input.appendChild(option);
          });
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.className = 'quiz-input';
          input.placeholder = q.placeholder || 'Type your answer...';
        }
        qDiv.appendChild(input);
        const nextBtn = document.createElement('button');
        nextBtn.textContent = currentStep === quizQuestions.length - 1 ? 'Get Playlist' : 'Next';
        nextBtn.className = 'btn premium-btn';
        nextBtn.onclick = () => {
          answers[currentStep] = input.value || (input.options && input.options[input.selectedIndex].value);
          currentStep++;
          if (currentStep < quizQuestions.length) {
            renderQuizStep();
          } else {
            submitQuiz();
          }
        };
        qDiv.appendChild(nextBtn);
        quizContainer.appendChild(qDiv);
      }
    }
    async function submitQuiz() {
      quizContainer.innerHTML = '<em>Generating your playlist...</em>';
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:3001/playlist-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({
          mood: answers[0],
          genre: answers[1],
          activity: answers[2],
          favoriteArtist: answers[3],
          repeatSong: answers[4]
        })
      });
      const data = await res.json();
      renderPlaylistResult(data);
    }
    function renderPlaylistResult(data) {
      quizContainer.innerHTML = '';
      let html = '<div class="premium-quiz-result">';
      if (!data || !data.tracks || !data.tracks.length) {
        html += '<p>No playlist found. Try again!</p>';
      } else {
        if (data.comment) {
          html += `<div class="playlist-comment" style="font-style:italic;color:#ffd166;font-size:1.1em;margin-bottom:1.2em;">${data.comment}</div>`;
        }
        html += '<h3>Your Playlist (If you don\'t like it, please retry with diffrent aritsts/songs,prefer international artists)</h3><ul>';
        data.tracks.forEach(track => {
          html += `<li><strong>${track.name}</strong> by ${track.artist} ` +
            (track.url && track.url !== '#' ? `<a href="${track.url}" target="_blank">Play</a>` : '<span style="color:#888;margin-left:0.5em;">Not available</span>') +
            `</li>`;
        });
        html += '</ul>';
      }
      html += `<button class="btn premium-btn" id="createAnotherPlaylistBtn" style="margin-top:1.5rem;">Create Another Playlist</button>`;
      html += '</div>';
      quizContainer.innerHTML = html;
      document.getElementById('createAnotherPlaylistBtn').onclick = () => {
        currentStep = 0;
        answers.length = 0;
        renderQuizStep();
      };
    }
    // Modal open/close logic
    modal.style.display = 'flex';
    currentStep = 0;
    answers.length = 0;
    renderQuizStep();
    document.body.style.overflow = 'hidden';
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      quizContainer.innerHTML = '';
      resultContainer.innerHTML = '';
    };
    window.onclick = function(event) {
      if (event.target === modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        quizContainer.innerHTML = '';
        resultContainer.innerHTML = '';
      }
    };
  };
}
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('openPlaylistQuizBtn')) {
    initPlaylistQuiz();
  }
});

function requireLoginOrRedirect() {
  const token = localStorage.getItem('token');
  if (!token) {
    localStorage.setItem('loginRedirectMsg', 'Please login or sign up to enjoy the features.');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Apply to all main features
if (document.getElementById('chatForm') || document.getElementById('drawingCanvas') || document.getElementById('playlistQuizSection') || document.getElementById('moodForm')) {
  requireLoginOrRedirect();
}

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  const playlistForm = document.getElementById('playlist-form');
  const playlistPreview = document.getElementById('playlist-preview');

  // Show form if authenticated
  if (window.location.search.includes('auth=success')) {
    loginBtn.style.display = 'none';
    playlistForm.style.display = 'block';
  }

  loginBtn.addEventListener('click', () => {
    window.location.href = '/login';
  });

  // Real-time spellcheck feedback (client-side, for demo)
  function showSuggestion(inputId, suggestionId) {
    const input = document.getElementById(inputId);
    const suggestion = document.getElementById(suggestionId);
    input.addEventListener('input', () => {
      // Simple demo: highlight if word is long and not in a basic list
      const value = input.value.trim();
      if (value && value.length > 2 && !['happy','sad','pop','rock','workout','study','chill'].includes(value.toLowerCase())) {
        suggestion.textContent = 'Check spelling?';
      } else {
        suggestion.textContent = '';
      }
    });
  }
  showSuggestion('mood', 'mood-suggestion');
  showSuggestion('genres', 'genres-suggestion');
  showSuggestion('activities', 'activities-suggestion');

  // Only run playlist generator logic if on chat.html
  if (document.getElementById('playlist-generator-section')) {
    playlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      playlistPreview.innerHTML = 'Generating playlist...';
      const mood = document.getElementById('mood').value;
      const genres = document.getElementById('genres').value;
      const activities = document.getElementById('activities').value;
      const playlistName = document.getElementById('playlistName').value;
      try {
        const res = await fetch('/generate-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mood, genres, activities, playlistName })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        playlistPreview.innerHTML = `
          <h3>Playlist Created!</h3>
          <a href="${data.playlistUrl}" target="_blank">Open in Spotify</a>
          <ul style="margin-top:1.2rem;">
            ${data.tracks.map(track => `
              <li style="margin-bottom:1rem;">
                <img src="${track.image}" alt="" width="50" style="vertical-align:middle;"> 
                <strong>${track.name}</strong> by ${track.artist} <br>
                <audio controls src="${track.preview_url}"></audio>
              </li>
            `).join('')}
          </ul>
          <h4>Corrected Input:</h4>
          <pre>${JSON.stringify(data.corrected, null, 2)}</pre>
        `;
      } catch (err) {
        playlistPreview.innerHTML = `<span style="color:red;">${err.message}</span>`;
      }
    });
  }
}); 