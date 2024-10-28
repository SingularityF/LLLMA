const { ipcRenderer } = require('electron');
const micButton = document.getElementById('mic-button');
const editButton = document.getElementById('edit-button');
const textInputInterface = document.getElementById('text-input-interface');
const audioInputDisplay = document.getElementById('audio-input-display');
const promptDisplay = document.getElementById('recognized-text');
const reponseDisplay = document.getElementById('generated-text');
const alwaysOnTopSwitch = document.getElementById('alwaysOnTopSwitch');

let recorder;
let audioContext;
let gumStream;
let outputText = "";

function getRegisteredAppsData() {
  const data = [];
  const rows = document.querySelectorAll("#registeredAppsDisplay tr");
  rows.forEach(row => {
      const appName = row.cells[1].querySelector("input").value;
      const command = row.cells[2].querySelector("input").value;
      data.push({ appName, command });
  });
  return data;
}

// Function to add a new row
function registerNewApp() {
  const table = document.getElementById("registeredAppsDisplay");
  const newRow = document.createElement("tr");
  newRow.innerHTML = `
      <td><input type="checkbox" class="form-check-input row-checkbox"></td>
      <td><input type="text" class="form-control form-control-sm" placeholder="app..."></td>
      <td><input type="text" class="form-control form-control-sm" placeholder="command..."></td>
      `;
  table.appendChild(newRow);
}

// Function to delete selected rows
function deleteRegisteredApps() {
  const table = document.getElementById("registeredAppsDisplay");
  const checkboxes = document.querySelectorAll(".row-checkbox");
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      const row = checkbox.closest("tr");
      table.removeChild(row);
    }
  });
}

async function launchApplication(command) {
  try {
    const output = await ipcRenderer.invoke('launch-app', command);
    console.log('Application launched successfully:', output);
  } catch (error) {
    console.error('Failed to launch application:', error);
  }
}

// Function to populate the select element with audio output devices
async function populateAudioOutputSelector() {
  const selectElement = document.getElementById('outputDeviceSelector');

  try {
    // Get all media devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Filter out the audio output devices
    const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

    // Clear existing options
    selectElement.innerHTML = '';

    // Populate the select element with new options
    audioOutputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Device ${device.deviceId}`; // Provide a fallback label if none is available
      selectElement.appendChild(option);
    });

    // Optionally, handle no available devices
    if (audioOutputs.length === 0) {
      selectElement.innerHTML = '<option>No audio output devices found</option>';
    }

  } catch (error) {
    console.error('Error accessing media devices.', error);
    selectElement.innerHTML = '<option>Error accessing devices</option>';
  }
}

function populateVoiceList() {
  const voiceSelect = document.getElementById('ttsVoiceSelector');
  const voices = window.speechSynthesis.getVoices();

  voiceSelect.innerHTML = '';
  voices.forEach((voice, index) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name}`;
    voiceSelect.appendChild(option);
  });
}

if (typeof window.speechSynthesis !== 'undefined') {
  window.speechSynthesis.onvoiceschanged = populateVoiceList;
}

document.getElementById("workspace-link").addEventListener("click", function () {
  document.getElementById("workspace-tab").classList.remove("d-none");
  document.getElementById("workspace-link").classList.add("active");
  document.getElementById("settings-tab").classList.add("d-none");
  document.getElementById("settings-link").classList.remove("active");
});

document.getElementById("settings-link").addEventListener("click", function () {
  document.getElementById("workspace-tab").classList.add("d-none");
  document.getElementById("workspace-link").classList.remove("active");
  document.getElementById("settings-tab").classList.remove("d-none");
  document.getElementById("settings-link").classList.add("active");
});

alwaysOnTopSwitch.addEventListener('change', () => {
  ipcRenderer.send('set-always-on-top', alwaysOnTopSwitch.checked);
});

document.getElementById('llm-prompt-input').addEventListener('keydown', function (event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitPrompt();
  }
});

document.getElementById('submit-prompt-button').addEventListener('click', function () {
  submitPrompt();
});

function submitPrompt() {
  const inputElement = document.getElementById('llm-prompt-input')
  const prompt = document.getElementById('llm-prompt-input').value;
  if (prompt.trim() !== '') {
    outputText = ""
    stopTTSAndClearQueue();
    updateInputDisplay(prompt);
  }
  document.getElementById('llm-prompt-input').value = '';
  inputElement.style.height = '';
  inputElement.style.height = inputElement.scrollHeight + 'px'
}

micButton.addEventListener('mousedown', () => {
  textInputInterface.classList.add('d-none');
});

editButton.addEventListener('click', () => {
  if (textInputInterface.classList.contains('d-none')) {
    textInputInterface.classList.remove('d-none');
  } else {
    textInputInterface.classList.add('d-none');
  }
  document.getElementById('llm-prompt-input').focus();
});

micButton.addEventListener('mousedown', () => {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      audioContext = new AudioContext();
      gumStream = stream;
      const input = audioContext.createMediaStreamSource(stream);
      recorder = new Recorder(input, { numChannels: 1 });
      recorder.record();
      micButton.style.backgroundColor = 'green';
    }).catch(err => {
      console.error('Error accessing microphone:', err);
    });
});

micButton.addEventListener('mouseup', () => {
  recorder.stop();
  gumStream.getAudioTracks()[0].stop();
  micButton.style.backgroundColor = 'red';

  recorder.exportWAV(blob => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.onloadend = () => {
      const buffer = Buffer.from(reader.result);
      const fs = require('fs');
      const path = require('path');
      const audioFilePath = path.join(__dirname, 'recorded_audio.wav');
      fs.writeFileSync(audioFilePath, buffer);

      // Call the Python application with the audio file path
      //callPythonApp(audioFilePath);

      ipcRenderer.send('perform-speech-recognition', audioFilePath);
      console.log("Speech Recognition in Process");

    };
  });
});

function updateInputDisplay(text) {
  promptDisplay.innerHTML = text;
  outputText = ""
  stopTTSAndClearQueue();
  ipcRenderer.send('generate-prompt', { prompt: text, registeredApps: getRegisteredAppsData() });
}

ipcRenderer.on('speech-recognition-result', (event, data) => {
  updateInputDisplay(data.text);
});

ipcRenderer.on("generate-prompt-token", (event, data) => {
  outputText += data;
  reponseDisplay.innerHTML = outputText.toString();
});

ipcRenderer.on("generate-prompt-sentence", (event, data) => {
  addSentenceToQueue(data);
});


ipcRenderer.on("generate-prompt-error", (event, data) => {
  console.log(data);
});


// Speech synthesis controller object
const ttsController = {
  queue: [],
  speaking: false,

  // Enqueue a sentence for TTS
  enqueue: function (sentence) {
    this.queue.push(sentence);
    if (!this.speaking) {
      this.next();
    }
  },

  // Dequeue and speak the next sentence
  next: function () {
    if (this.queue.length > 0) {
      this.speaking = true;
      const nextSentence = this.queue.shift();
      const utterance = new SpeechSynthesisUtterance(nextSentence);
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find(voice => voice.name == document.getElementById('ttsVoiceSelector').value);
      utterance.onend = () => {
        this.speaking = false;
        this.next();
      };
      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance error:', event.error);
        this.speaking = false;
        this.next();
      };
      window.speechSynthesis.speak(utterance);
    }
  },

  // Stop speech and clear the queue
  stopAndClear: function () {
    window.speechSynthesis.cancel(); // This will stop the current speech
    this.queue = [];
    this.speaking = false;
  }
};

// Interface for adding sentences to the queue
function addSentenceToQueue(sentence) {
  ttsController.enqueue(sentence);
}

// Interface for stopping and clearing the TTS queue
function stopTTSAndClearQueue() {
  ttsController.stopAndClear();
}

populateAudioOutputSelector();