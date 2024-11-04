const { ipcRenderer } = require('electron');
const marked = require('marked');

const micButton = document.getElementById('mic-button');
const editButton = document.getElementById('edit-button');
const textInputInterface = document.getElementById('text-input-interface');
const audioInputDisplay = document.getElementById('audio-input-display');
const promptDisplay = document.getElementById('recognized-text');
const reponseDisplay = document.getElementById('generated-text');
const openMicSwitch = document.getElementById('openMicSwitch');
const alwaysOnTopSwitch = document.getElementById('alwaysOnTopSwitch');

let recorder;
let audioContext;
let gumStream;
let outputText = "";
let openMicFlag = false;
let currentSessionId;
let se_loading = new Audio('SE/se_loading.mp3');
se_loading.loop = true;
se_loading.volume = .15;
se_loading.preload = 'auto';

navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
    const outputDeviceSelector = document.getElementById('outputDeviceSelector');
    const outputDeviceSelection = localStorage.getItem("outputDeviceSelection");

    if (audioOutputDevices.length > 0) {
      audioOutputDevices.forEach((device, index) => {
        if (device.deviceId != "default" && device.deviceId != "communications") {
          const option = document.createElement('option');
          option.value = device.deviceId;
          if (device.deviceId == outputDeviceSelection) {
            option.selected = true;
            se_loading.setSinkId(device.deviceId);
          }
          option.textContent = `${device.label}`;
          outputDeviceSelector.appendChild(option);
        }
      });
    } else {
      console.log('No audio output devices found.');
    }
  })
  .catch(error => {
    console.error('Error listing audio devices:', error);
  });

navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    audioContext.audioWorklet.addModule('openmic-processor.js') // Path to your worklet file
      .then(() => {
        const noiseProcessor = new AudioWorkletNode(audioContext, 'openmic-processor');
        source.connect(noiseProcessor).connect(audioContext.destination);

        noiseProcessor.port.onmessage = (event) => {
          if (event.data == "Noise detected") {
            if (openMicFlag) {
              console.log("Unmute event detected");
              startRecording();
            }
          } else if (event.data == "No noise detected") {
            if (openMicFlag) {
              console.log("Mute event detected")
              endRecording();
            }
          } else {
            console.log(event.data); // Log or handle messages from your worklet
          }
        };
      });
  })
  .catch(err => console.error('Error accessing media devices.', err));

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

function populateVoiceList() {
  const voiceSelect = document.getElementById('ttsVoiceSelector');
  const voices = window.speechSynthesis.getVoices();
  const ttsSelection = localStorage.getItem("ttsSelection");

  voiceSelect.innerHTML = '';
  voices.forEach((voice, index) => {
    const option = document.createElement('option');
    option.value = voice.name;
    if (voice.name == ttsSelection) {
      option.selected = true;
    }
    option.textContent = `${voice.name}`;
    voiceSelect.appendChild(option);
  });
}

if (typeof window.speechSynthesis !== 'undefined') {
  window.speechSynthesis.onvoiceschanged = populateVoiceList;
}

document.getElementById("ttsVoiceSelector").addEventListener('change', function () {
  const ttsSelection = this.value;
  localStorage.setItem('ttsSelection', ttsSelection);
});
document.getElementById("outputDeviceSelector").addEventListener('change', function () {
  const outputDeviceSelection = this.value;
  localStorage.setItem('outputDeviceSelection', outputDeviceSelection);
  se_loading.setSinkId(outputDeviceSelection);
});

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

openMicSwitch.addEventListener('change', () => {
  openMicFlag = !openMicFlag;
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

function killSession() {
  if (currentSessionId) {
    ipcRenderer.send('kill-session', currentSessionId);
  }
}

function startSession() {
  currentSessionId = crypto.randomUUID();
  ipcRenderer.send('start-session', currentSessionId, document.getElementById('ttsVoiceSelector').value);
}

function submitPrompt() {
  killSession();
  startSession();
  const inputElement = document.getElementById('llm-prompt-input')
  const prompt = document.getElementById('llm-prompt-input').value;
  if (prompt.trim() !== '') {
    outputText = ""
    updateInputDisplay(currentSessionId, prompt);
  }
  document.getElementById('llm-prompt-input').value = '';
  inputElement.style.height = '';
  inputElement.style.height = inputElement.scrollHeight + 'px';
}

editButton.addEventListener('click', () => {
  if (textInputInterface.classList.contains('d-none')) {
    textInputInterface.classList.remove('d-none');
  } else {
    textInputInterface.classList.add('d-none');
  }
  document.getElementById('llm-prompt-input').focus();
});

function startRecording() {
  killSession();
  startSession();
  textInputInterface.classList.add('d-none');
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      audioContext = new AudioContext();
      gumStream = stream;
      const input = audioContext.createMediaStreamSource(stream);
      recorder = new Recorder(input, { numChannels: 1 });
      recorder.record();
      micButton.classList.add('btn-success');
      micButton.classList.remove('btn-danger');
    }).catch(err => {
      console.error('Error accessing microphone:', err);
    });
}

function endRecording() {
  recorder.stop();
  gumStream.getAudioTracks()[0].stop();
  micButton.classList.remove('btn-success');
  micButton.classList.add('btn-danger');

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

      ipcRenderer.send('perform-speech-recognition', currentSessionId, audioFilePath);
      console.log("Speech Recognition in Process");
      se_loading.loop = true;
      se_loading.play();
    };
  });
}

micButton.addEventListener('mousedown', () => {
  startRecording();
});

micButton.addEventListener('mouseup', () => {
  endRecording();
});

function updateInputDisplay(sessionId, text) {
  promptDisplay.innerHTML = text;
  outputText = ""
  ipcRenderer.send('generate-prompt', { prompt: text, registeredApps: getRegisteredAppsData(), sessionId: sessionId });
}

ipcRenderer.on('speech-recognition-result', (event, sessionId, data) => {
  if (currentSessionId == sessionId) {
    updateInputDisplay(sessionId, data.text);
  }
});

ipcRenderer.on("generate-prompt-token", (event, sessionId, data) => {
  if (currentSessionId == sessionId) {
    outputText += data;
    reponseDisplay.innerHTML = marked.parse(outputText.toString());
    se_loading.loop = false;
  }
});

ipcRenderer.on("generate-prompt-error", (event, data) => {
  console.log(data);
});

const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))
