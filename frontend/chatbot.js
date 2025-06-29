// Chatbot Logic
const modePrompts = {
  listener: 'You are a supportive friend who listens empathetically. Respond by reflecting and validating the user\'s feelings. Do not give advice unless asked.',
  cheerleader: 'You are a cheerful, motivating friend. Respond with encouragement and positivity, helping the user feel better and motivated.',
  advisor: 'You are a wise, gentle advisor. Offer practical, kind suggestions to help the user, but always be supportive.',
  partner: 'pretend that you are an actual human with normal life.You are a virtual romantic partnerof user Respond by reflecting and validating the user\'s feelings. Do not give advice unless asked. you are suppoed to be a loving and caring partner for the user so engane in romantic and deep conversations butt back out respectfully if its vulgar.'
};

let selectedMode = 'listener';
let chatHistory = [];

const modeSelect = document.getElementById('botMode');
const startChatBtn = document.getElementById('startChat');
const modeSelectContainer = document.getElementById('modeSelectContainer');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');

if (modeSelect && startChatBtn && chatContainer && chatMessages && chatForm && userInput) {
  let lastMode = modeSelect.value;

  startChatBtn.onclick = () => {
    selectedMode = modeSelect.value;
    chatContainer.style.display = 'block';
    chatMessages.innerHTML = '';
    chatHistory = [];
    addBotMessage('Hi! I\'m here for you. How are you feeling today?');
    lastMode = selectedMode;
    startChatBtn.style.display = 'none';
  };

  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;
    addUserMessage(message);
    userInput.value = '';
    addBotMessage('...');
    const response = await getAIResponse(message);
    replaceLastBotMessage(response);
  };

  modeSelect.addEventListener('change', () => {
    selectedMode = modeSelect.value;
    if (selectedMode !== lastMode) {
      let modeLabel = selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1);
      addSystemMessage(`Bot mode changed to: ${modeLabel}`);
      lastMode = selectedMode;
    }
  });

  document.querySelectorAll('.custom-select-option').forEach(opt => {
    opt.onclick = function(e) {
      e.stopPropagation();
      document.querySelectorAll('.custom-select-option').forEach(o => {
        o.classList.remove('selected');
        // Remove any checkmark or icon, just show text
        o.innerHTML = o.textContent;
      });
      opt.classList.add('selected');
      currentValue = opt.getAttribute('data-value');
      selected.innerHTML = opt.textContent; // Only text, no checkmark in the display
      hiddenInput.value = currentValue;
      closeDropdown();
    };
  });
}

function addUserMessage(msg) {
  chatHistory.push({ role: 'user', content: msg });
  const div = document.createElement('div');
  div.className = 'user';
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMessage(msg) {
  chatHistory.push({ role: 'bot', content: msg });
  const div = document.createElement('div');
  div.className = 'bot';
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function replaceLastBotMessage(msg) {
  chatHistory[chatHistory.length - 1].content = msg;
  const bots = chatMessages.querySelectorAll('.bot');
  if (bots.length) bots[bots.length - 1].textContent = msg;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(msg) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function getAIResponse(userMsg) {
  const prompt = `${modePrompts[selectedMode]}\nUser: ${userMsg}`;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('http://localhost:3001/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, userMessage: userMsg })
    });
    const data = await res.json();
    if (data && data.generated_text) {
      return data.generated_text.replace(/^.*?: /, '');
    } else if (data && data[0] && data[0].generated_text) {
      return data[0].generated_text.replace(/^.*?: /, '');
    } else {
      return 'Sorry, I\'m having trouble responding right now.';
    }
  } catch (e) {
    return 'Sorry, I\'m having trouble connecting to the AI.';
  }
} 