// app/api/translate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { translateAudio } from '@/app/lib/openai-translator';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const targetLang = formData.get('targetLang') as string || 'en';

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Convert audio to a proper File object
    const audioArrayBuffer = await audioFile.arrayBuffer();
    const mimeType = audioFile.type || 'audio/webm';
    const fileName = audioFile.name || 'recording.webm';
    const audioBlob = new Blob([audioArrayBuffer], { type: mimeType });
    const processedFile = new File([audioBlob], fileName, { type: mimeType });

    // Process the audio
    const result = await translateAudio(processedFile, targetLang);

    // Convert audio buffer to base64 for JSON transmission
    const outputAudioBuffer = Buffer.from(await result.audio.arrayBuffer());
    const audioBase64 = outputAudioBuffer.toString('base64');

    return NextResponse.json({
      originalText: result.originalText,
      originalLanguage: result.originalLanguage,
      translatedText: result.translatedText,
      targetLanguage: result.targetLanguage,
      audioBase64, // Send as base64 string
    });

  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Translation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
