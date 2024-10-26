# LLLMA
Local LLM Assistant (LLLMA) is like Microsoft Copilot (in 2024) but runs offline and can be personalized to interact with your system

## Important
- This app has only been tested to work on Windows 11
- This app is customized for my personal use, feature requests are not guaranteed to be supported, feel free to fork the repo

## Setup
1. Install [Node.js](https://nodejs.org/)
2. Install [Ollama](https://ollama.com/)
3. Install [Docker Desktop](https://www.docker.com/)
4. In `cmd`, run `ollama run llama3.2` to download the Llama 3.2 3B model. Make sure ollama is running in your system tray
5. Download Git repository
6. In a shell of your choice, make sure `LLLMA` folder is the working directory
7. Run `npm i` to install dependencies
8. Run `docker compose up --detach faster-whisper-server-cpu` to install [speech recognition server](https://github.com/fedirz/faster-whisper-server). Make sure Docker Desktop with the container is running in your system tray
9. Run `npm start` to launch the UI
10. Press and hold the mic button to speak with the assistant, first time may take some time to download the speech recognition model, subsequent conversations are real-time (on a machine with decent specs)

## Debug
- You may not hear the TTS if you don't have the EN-US language pack installed. There will be a dropdown to select the TTS voice for your system, at the moment you can modify this line `utterance.voice = voices.find(voice => voice.name.includes("Zira"));` in the `renderer.js` file
- Multi-language support will be added for speech recognition, for now you can modify the whisper model used in this line `formData.append('model', 'tiny.en');` in the `index.js` file, refer to [this](https://github.com/openai/whisper?tab=readme-ov-file#available-models-and-languages)
- If speech recognition is not working well for you, you can use a larger model, refer to [this](https://github.com/openai/whisper?tab=readme-ov-file#available-models-and-languages)
- You will be able to start a new conversation, for now just restart the app to clear conversation memory
- Text input will be supported
- It's normal if the code is hard to understand, it's mostly written by AI and I haven't read most of them
