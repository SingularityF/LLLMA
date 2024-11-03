class OpenMicProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isNoiseDetected = false;
        this.noiseThreshold = 0.001;  // Threshold for detecting noise
        this.noiseDetectionInterval = 3000; // 1 second (x seconds in milliseconds)
        this.lastTimeNoiseDetected = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const now = currentTime;

        if (input.length > 0) {
            const inputChannel = input[0];
            let sum = 0;
            for (let i = 0; i < inputChannel.length; i++) {
                sum += inputChannel[i] * inputChannel[i];
            }
            let volume = Math.sqrt(sum / inputChannel.length);

            // Check if current volume exceeds the noise threshold
            if (volume > this.noiseThreshold) {
                this.lastTimeNoiseDetected = now;
                if (!this.isNoiseDetected) {
                    this.isNoiseDetected = true;
                    this.port.postMessage('Noise detected');
                }
            }

            // Check if no noise has been detected for the specified interval
            if (this.isNoiseDetected && (now - this.lastTimeNoiseDetected > this.noiseDetectionInterval / 1000)) {
                this.isNoiseDetected = false;
                this.port.postMessage('No noise detected');
            }
        }

        return true;
    }
}

registerProcessor('openmic-processor', OpenMicProcessor);
