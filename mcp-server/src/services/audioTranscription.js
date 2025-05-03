const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Transcribe audio data from base64 to text using OpenAI's API
 * 
 * @param {string} base64Audio - Base64 encoded audio data
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(base64Audio) {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Audio, 'base64');
    
    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFileName = path.join(tempDir, `audio-${Date.now()}.wav`);
    
    // Write the audio data to the temporary file
    fs.writeFileSync(tempFileName, buffer);
    
    // Call OpenAI API to transcribe audio
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFileName),
      model: 'whisper-1',
    });
    
    // Clean up - delete the temporary file
    fs.unlinkSync(tempFileName);
    
    return response.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

module.exports = {
  transcribeAudio
}; 