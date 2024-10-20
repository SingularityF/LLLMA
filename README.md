# LLLMA
Local LLM Assistant (LLLMA) is like Microsoft Copilot (in 2024) but runs offline and can be personalized to interact with your system

## Setup

1. Install [Node.js](https://nodejs.org/)
2. Install [Ollama](https://ollama.com/)
3. Install [Docker Desktop](https://www.docker.com/)
4. In `cmd`, run `ollama run llama3.2` to download the Llama 3.2 3B model. Make sure ollama is running in your system tray
5. Download Git repository
6. In a shell of your choice, make sure `LLLMA` folder is the working directory
7. Run `npm i` to install dependencies
8. Run `docker compose up --detach faster-whisper-server-cpu` to install speech recognition server. Make sure Docker Desktop with the container is running in your system tray
9. Run `npm start` to launch the UI
10. Press and hold the mic button to speak with the assistant
