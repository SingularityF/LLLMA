const { ipcRenderer } = require('electron');
const he = require('he');
const marked = require('marked');
let windowSessionId;
let windowVoiceName;

ipcRenderer.on("generate-prompt-sentence", (event, sessionId, data) => {
    if (windowSessionId == sessionId) {
        // Convert markdown to HTML tags, then remove HTML tags
        const plainText = marked.parse(data).replace(/<[^>]+>/g, '');
        // Unescape HTML like &amp;
        addToTTSQueue(he.decode(plainText));
    }
});

ipcRenderer.on("set-session-id", (event, sessionId) => {
    windowSessionId = sessionId;
    console.log("Session ID set");
});

ipcRenderer.on("set-voice-name", (event, voiceName) => {
    windowVoiceName = voiceName;
    console.log("Voice set");
});

function addToTTSQueue(sentence) {
    const utterance = new SpeechSynthesisUtterance(sentence);
    const voices = speechSynthesis.getVoices();
    utterance.rate = 0.8;
    utterance.voice = voices.find(voice => voice.name == windowVoiceName);
    console.log("Reading: " + sentence);
    window.speechSynthesis.speak(utterance);
}

// speechSynthesis only seems to load voices after being called once, otherwise voice is null
addToTTSQueue("");