// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const moment = require('moment');


function addContext(){
  datetimeNow = moment().format();
  context = {role: "system", content: `Context: The current date and time is ${datetimeNow}. An application can be launched with system output [STARTAPP APPNAME], for example [STARTAPP CHROME]. Currently supported apps include CHROME, PHOTOSHOP, LIGHTROOM, BASH, STEAM.` };
  return [context];
}


ipcMain.on('perform-speech-recognition', (event, audioFilePath) => {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(audioFilePath));
  formData.append('model', 'tiny.en');

  const config = {
    headers: {
      ...formData.getHeaders()
    }
  };

  axios.post('http://localhost:51482/v1/audio/transcriptions', formData, config)
    .then(response => {
      event.sender.send('speech-recognition-result', response.data);
    })
    .catch(error => {
      console.error('Error:', error);
    });
});



// Initialize a history queue with a maximum length of 5
let messageHistory = [];
const MAX_HISTORY_LENGTH = 10; // Maximum of 5 pairs (user + assistant)

ipcMain.on('generate-prompt', (event, args) => {
  const prompt = args.prompt;
  console.log('Received generate-prompt event with prompt:', prompt);

  // Add the new user message to the history
  messageHistory.push({ role: 'user', content: prompt });

  // Log the current message history
  console.log('Current message history:', messageHistory);
  // Send POST request to the API with the conversation history
  axios({
    method: 'post',
    url: 'http://localhost:11434/api/chat',
    data: {
      model: 'llama3.2',
      messages: addContext().concat(messageHistory),
    },
    responseType: 'stream', // Important for handling streaming responses
  })
    .then((response) => {
      console.log('Received response from API');
      const stream = response.data;
      let buffer = ''; // Buffer to accumulate incoming chunks
      let sentenceBuffer = ''; // Buffer to accumulate text until a full sentence is formed
      let isDone = false; // Flag to ensure 'generate-prompt-done' is sent only once

      let llmResponseContent = ''; // To accumulate the LLM's response for history

      stream.on('data', (chunk) => {
        event.sender.send('generate-prompt-token', JSON.parse(chunk).message.content);
        const chunkStr = chunk.toString();
        //console.log('Received chunk:', chunkStr);

        buffer += chunkStr;

        // Split buffer into lines based on newline character
        let lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop();

        for (let line of lines) {
          if (line.trim() === '') continue; // Skip empty lines
          try {
            //console.log('Processing line:', line);
            const data = JSON.parse(line);

            // Extract the text chunk from the new structure
            const textChunk = data.message && data.message.content ? data.message.content : '';
            const done = data.done;

            //console.log('Parsed data:', data);

            // Accumulate text chunks to form sentences
            sentenceBuffer += textChunk;
            llmResponseContent += textChunk; // Accumulate for history

            // Regular expression to match complete sentences
            // This regex matches sentences that end with . ! ? and accounts for quotation marks
            let sentenceRegex = /([^.?!]*[^.?!\s][.?!]+)/g;
            let sentences = sentenceBuffer.match(sentenceRegex);

            if (sentences) {
              // Remove the matched sentences from the sentenceBuffer
              let lastIndex = 0;
              for (let sentence of sentences) {
                lastIndex += sentence.length;
              }
              let remainingText = sentenceBuffer.slice(lastIndex);
              sentenceBuffer = remainingText;

              // Send each complete sentence to the renderer
              for (let sentence of sentences) {
                let trimmedSentence = sentence;
                // Skip sentences that are only punctuation
                if (trimmedSentence && !/^[.?!]+$/.test(trimmedSentence)) {
                  console.log('Sending sentence to renderer:', trimmedSentence);
                  event.sender.send('generate-prompt-sentence', trimmedSentence);
                }
              }
            }

            if (done && !isDone) {
              isDone = true;
              // Send any remaining text as the last sentence if it's non-empty and not just punctuation
              let finalSentence = sentenceBuffer.trim();
              if (finalSentence && !/^[.?!]+$/.test(finalSentence)) {
                console.log('Sending last sentence to renderer:', finalSentence);
                event.sender.send('generate-prompt-sentence', finalSentence);
                sentenceBuffer = '';
              }
              // Add the LLM's response to the history
              messageHistory.push({ role: 'system', content: llmResponseContent.trim() });
              // Log the updated message history
              //console.log('Updated message history:', messageHistory);
              // Notify renderer process that generation is done
              console.log('Generation done, notifying renderer.');
              event.sender.send('generate-prompt-done');
            }
          } catch (err) {
            console.error('Error parsing JSON line:', err.message);
            console.error('Invalid JSON line:', line);
          }
        }
      });

      stream.on('end', () => {
        console.log('Stream ended');
        // Stream has ended, send any remaining text
        let finalSentence = sentenceBuffer.trim();
        if (finalSentence && !/^[.?!]+$/.test(finalSentence)) {
          console.log('Sending remaining sentence to renderer:', finalSentence);
          event.sender.send('generate-prompt-sentence', finalSentence);
        }
        // Ensure 'generate-prompt-done' is sent
        if (!isDone) {
          // Add the LLM's response to the history
          messageHistory.push({ role: 'system', content: llmResponseContent.trim() });
          // Ensure the history doesn't exceed 5 messages
          enforceHistoryLimit();
          // Log the updated message history
          console.log('Updated message history:', messageHistory);
          console.log('Generation done (stream end), notifying renderer.');
          event.sender.send('generate-prompt-done');
        }
      });

      stream.on('error', (err) => {
        console.error('Error in stream:', err.message);
        event.sender.send('generate-prompt-error', err.message);
      });
    })
    .catch((error) => {
      console.error('Error in request:', error.message);
      event.sender.send('generate-prompt-error', error.message);
    });
});


// Function to enforce the history length limit
function enforceHistoryLimit() {
  // Ensure the history doesn't exceed MAX_HISTORY_LENGTH
  while (messageHistory.length > MAX_HISTORY_LENGTH) {
    // Remove the oldest pair (user + assistant)
    messageHistory.shift(); // Remove oldest user message
    messageHistory.shift(); // Remove oldest assistant message
  }
  // Log the updated message history
  console.log('Updated message history:', messageHistory);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);