// Mock implementation for testing
async function transcribeAudio(base64Audio) {
  console.log('📝 Mock audio transcription called');
  return "This is a mock transcription for testing";
}

module.exports = {
  transcribeAudio
}; 