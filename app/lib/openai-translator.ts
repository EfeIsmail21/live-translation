// lib/openai-translator.ts

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(audioFile: File) {
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1", // Using standard Whisper model
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
    model: "gpt-4o-mini", // Goedkoper dan gpt-4o
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
    temperature: 0.3, // Consistent translations
  });

  return completion.choices[0].message.content || text;
}

export async function textToSpeech(text: string, language: string) {
  const voice = language === 'nl' ? 'alloy' : 'echo'; // Different voices
  
  const mp3 = await openai.audio.speech.create({
    model: "tts-1", // or "tts-1-hd" for higher quality
    voice: voice,
    input: text,
  });
  
  return mp3; // Returns audio buffer
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