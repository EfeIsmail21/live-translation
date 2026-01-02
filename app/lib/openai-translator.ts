import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(audioFile: File) {
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    response_format: "verbose_json",
  });

  return {
    text: transcription.text,
    language: transcription.language,
  };
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a professional translator for a logistics company.
        Translate the following text from ${sourceLang} to ${targetLang}.
        Keep it brief and literal. Use logistics terminology when appropriate.
        Only output the translation, nothing else.`
      },
      {
        role: "user",
        content: text
      }
    ],
    temperature: 0.3,
  });

  return completion.choices[0].message.content || text;
}

export async function textToSpeech(text: string, language: string) {
  // Select voice based on language for more natural pronunciation
  // Available voices: alloy, echo, fable, onyx, nova, shimmer
  let voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

  switch (language.toLowerCase()) {
    case 'nl':
    case 'dutch':
      voice = 'nova'; // Female voice, clearer for Dutch
      break;
    case 'en':
    case 'english':
      voice = 'echo'; // Male voice for English
      break;
    case 'fr':
    case 'french':
      voice = 'shimmer'; // Female voice, good for Romance languages
      break;
    case 'de':
    case 'german':
      voice = 'onyx'; // Male voice, good for Germanic languages
      break;
    case 'es':
    case 'spanish':
      voice = 'shimmer'; // Female voice for Spanish
      break;
    case 'it':
    case 'italian':
      voice = 'nova'; // Female voice for Italian
      break;
    case 'pl':
    case 'polish':
      voice = 'alloy'; // Neutral voice for Polish
      break;
    case 'ro':
    case 'romanian':
      voice = 'shimmer'; // Female voice for Romanian
      break;
    default:
      voice = 'alloy'; // Default neutral voice
  }

  const mp3 = await openai.audio.speech.create({
    model: "tts-1-hd", // Use HD model for better quality and pronunciation
    voice: voice,
    input: text,
    speed: 0.95, // Slightly slower for clarity
  });

  return mp3;
}

// All-in-one pipeline
export async function translateAudio(
  audioFile: File,
  targetLang: string = 'nl'
) {
  // Step 1: Transcribe
  const { text, language } = await transcribeAudio(audioFile);
  
  // Step 2: Translate
  const translatedText = await translateText(text, language, targetLang);
  
  // Step 3: Text-to-Speech
  const audioBuffer = await textToSpeech(translatedText, targetLang);
  
  return {
    originalText: text,
    originalLanguage: language,
    translatedText,
    targetLanguage: targetLang,
    audio: audioBuffer,
  };
}