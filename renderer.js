const { ipcRenderer } = require('electron');
const marked = require('marked');
const { shell } = require('electron');

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
let seLoading = new Audio('SE/se_loading.mp3');
let commandBuffer = ""
seLoading.loop = true;
seLoading.volume = .15;
seLoading.preload = 'auto';

function openFileDialog(id) {
  ipcRenderer.send('open-file-dialog', id);
}

ipcRenderer.on('selected-file', (event, id, path) => {
  document.getElementById(id).value = path;
});

function addToCommandBuffer(text) {
  commandBuffer += text;
  commandBuffer = commandBuffer.slice(-10000);

  const regexApp = /\[STARTAPP (.*?)\]/;
  const regexLink = /\[OPENURL (.*?)\]/;

  let match = commandBuffer.match(regexApp);
  if (match) {
    registeredApps = getRegisteredAppsData();
    if (registeredApps.map((x) => x.appName).includes(match[1])) {
      const foundObject = registeredApps.find(x => x.appName == match[1]);
      launchApplication(foundObject.command);
      commandBuffer = "";
    }
  }

  match = commandBuffer.match(regexLink);
  if (match) {
    shell.openExternal(match[1]);
    commandBuffer = "";
  }
}

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
            seLoading.setSinkId(device.deviceId);
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


document.addEventListener('click', function (event) {
  if (event.target.tagName === 'A') {
    const href = event.target.href;
    // Check if the href starts with HTTP/HTTPS or other custom schemes you want to handle
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      event.preventDefault(); // Stop the link from opening internally
      shell.openExternal(href); // Open the link with the default system handler
    }
  }
});

const registeredAppsTemplate = (appName, command, lineNum) => `<td><input type="checkbox" class="form-check-input row-checkbox"></td>
<td><input type="text" class="form-control form-control-sm" value="${appName}" placeholder="app..."></td>
<td><input id="registeredApps-${lineNum}" type="text" class="form-control form-control-sm" value="${command}" placeholder="command..."></td>
<td><button class="btn btn-outline-secondary py-1 px-2" onclick="openFileDialog('registeredApps-${lineNum}')"><i class="bi bi-folder"></i></button></td>
`;

function getRegisteredAppsData() {
  const jsonData = localStorage.getItem('registeredApps');
  let data;
  if (jsonData) {
    data = JSON.parse(jsonData);
  } else {
    data = [
      { appName: "Calculator", command: "calc" },
      { appName: "Notepad", command: "notepad" }
    ];
    localStorage.setItem('registeredApps', JSON.stringify(data));
  }
  return data;
}

function populateRegisteredAppsDisplay(){
  const registeredApps = getRegisteredAppsData();
  registeredApps.forEach((element, i) => {
    const table = document.getElementById("registeredAppsDisplay");
    const newRow = document.createElement("tr");
    newRow.innerHTML = registeredAppsTemplate(element.appName, element.command, i);
    table.appendChild(newRow);
  });
  
}

function saveRegisteredApps() {
  const table = document.getElementById('registeredAppsTable');
  const headers = Array.from(table.querySelectorAll('thead th'));
  const rows = table.querySelectorAll('tbody tr');

  // Determine the indices of the columns
  const appNameIndex = headers.findIndex(th => th.textContent.trim() === 'App Name');
  const commandIndex = headers.findIndex(th => th.textContent.trim() === 'Command');

  // Extract data from these specific columns
  const registeredApps = Array.from(rows).map(row => {
    const cells = row.querySelectorAll('td');
    return {
      appName: cells[appNameIndex].querySelector('input').value,
      command: cells[commandIndex].querySelector('input').value
    };
  });
  const serializedData = JSON.stringify(registeredApps);
  localStorage.setItem('registeredApps', serializedData);
}

// Function to add a new row
function registerNewApp() {
  const table = document.getElementById("registeredAppsDisplay");
  const newRow = document.createElement("tr");
  const id = crypto.randomUUID();
  newRow.innerHTML = registeredAppsTemplate("", "", id);
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
  seLoading.setSinkId(outputDeviceSelection);
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
  document.getElementById("controls-interface").classList.toggle("d-none");
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
      seLoading.loop = true;
      seLoading.play();
      document.getElementById("srLoadingIndicator").classList.remove("d-none");
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
    addToCommandBuffer(data);
    reponseDisplay.innerHTML = marked.parse(outputText.toString());
    seLoading.loop = false;
    document.getElementById("srLoadingIndicator").classList.add("d-none");
  }
});

ipcRenderer.on("generate-prompt-error", (event, data) => {
  console.log(data);
});

function initialize(){
  populateRegisteredAppsDisplay();
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))
}

initialize();