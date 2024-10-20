const { ipcRenderer } = require('electron');
const micButton = document.getElementById('mic-button');
const promptDisplay = document.getElementById('recognized-text');
const reponseDisplay = document.getElementById('generated-text');

let recorder;
let audioContext;
let gumStream;
let outputText = "";

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


outputText = "";

ipcRenderer.on('speech-recognition-result', (event, data) => {
  promptDisplay.innerHTML = "<pre style='white-space: pre-wrap;'>" + data.text + "</pre>";
  outputText = ""
  stopTTSAndClearQueue();
  ipcRenderer.send('generate-prompt', { prompt: data.text });
});

ipcRenderer.on("generate-prompt-token", (event, data) => {
  outputText += data;
  reponseDisplay.innerHTML = "<pre style='white-space: pre-wrap;'>" + outputText.toString() + "</pre>";
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
  enqueue: function(sentence) {
      this.queue.push(sentence);
      if (!this.speaking) {
          this.next();
      }
  },

  // Dequeue and speak the next sentence
  next: function() {
      if (this.queue.length > 0) {
          this.speaking = true;
          const nextSentence = this.queue.shift();
          const utterance = new SpeechSynthesisUtterance(nextSentence);
          const voices = speechSynthesis.getVoices();
          utterance.voice = voices.find(voice => voice.name.includes("Zira"));
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
  stopAndClear: function() {
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