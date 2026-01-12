/**
 * Shared model configuration
 * 
 * This ensures the model ID is consistent between the download script
 * and the application code.
 */

// Whisper model to use for transcription
// Available options:
// - 'Xenova/whisper-tiny' (~40MB) - Fastest, less accurate
// - 'Xenova/whisper-base' (~75MB) - Good balance
// - 'Xenova/whisper-base.en' (~75MB) - English-only, good balance
// - 'Xenova/whisper-small' (~240MB) - Better accuracy
// - 'Xenova/whisper-medium' (~770MB) - High accuracy, slower
const MODEL_ID = 'Xenova/whisper-base.en';

module.exports = {
  MODEL_ID,
};
