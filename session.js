const { ipcRenderer, session } = require('electron');
const he = require('he');
const marked = require('marked');
let windowSessionId;

ipcRenderer.on("generate-prompt-sentence", (event, sessionId, data) => {
    if (windowSessionId == sessionId) {
        const plainText = marked.parse(data).replace(/<[^>]+>/g, '');
        addToTTSQueue(he.decode(plainText));
    }
});

ipcRenderer.on("set-session-id", (event, sessionId) => {
    windowSessionId = sessionId;
});

function addToTTSQueue(sentence) {
    const utterance = new SpeechSynthesisUtterance(sentence);
    const voices = speechSynthesis.getVoices();
    utterance.rate = 0.8;
    // utterance.voice = voices.find(voice => voice.name == document.getElementById('ttsVoiceSelector').value);
    window.speechSynthesis.speak(utterance);
}