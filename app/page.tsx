// app/page.tsx

'use client';

import { useState, useRef } from 'react';
import { Mic, Square, Volume2, Loader2 } from 'lucide-react';

export default function TranslatorPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Try different MIME types for better compatibility with OpenAI
      let mimeType = 'audio/webm';
      let fileExtension = 'webm';

      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
        fileExtension = 'mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
        fileExtension = 'webm';
      }

      mediaRecorder.current = new MediaRecorder(stream, { mimeType });
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        setIsProcessing(true);

        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        const formData = new FormData();
        formData.append('audio', audioBlob, `recording.${fileExtension}`);
        formData.append('targetLang', 'en'); // Driver speaks Dutch → translate to English

        try {
          const response = await fetch('/api/translate', {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();

          setTranscript(result.originalText);
          setTranslation(result.translatedText);
          setDetectedLang(result.originalLanguage);

          // Play translated audio (decode from base64)
          const audioData = Uint8Array.from(atob(result.audioBase64), c => c.charCodeAt(0));
          const audioContext = new AudioContext();
          const audioBufferDecoded = await audioContext.decodeAudioData(audioData.buffer);
          const source = audioContext.createBufferSource();
          source.buffer = audioBufferDecoded;
          source.connect(audioContext.destination);
          source.start();

        } catch (error) {
          console.error('Translation error:', error);
        } finally {
          setIsProcessing(false);
        }
      };
      
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };
  
  return (
    <div className="min-h-screen text-white" style={{ background: '#212529' }}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-12 py-6">
          <h1 className="text-5xl font-bold mb-3 tracking-tight" style={{ color: '#ffffff' }}>
            VoiceBridge Translator
          </h1>
          <p className="text-xl font-light" style={{ color: '#f5f5f5', opacity: 0.8 }}>
            Real-time Translation for H. Essers
          </p>
        </header>

        <div className="max-w-5xl mx-auto space-y-6">
          {/* Driver Side */}
          <div
            className="rounded-lg p-8 shadow-xl"
            style={{ background: '#ffffff', color: '#212529' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium flex items-center gap-2">
                <span className="text-3xl">🚛</span>
                <span>Driver</span>
              </h2>
              {detectedLang && (
                <span
                  className="px-4 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: '#ce2828', color: '#ffffff' }}
                >
                  {detectedLang.toUpperCase()}
                </span>
              )}
            </div>

            <div className="mb-6">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className="w-full py-5 rounded-lg font-medium text-lg transition-all duration-200 flex items-center justify-center gap-3 shadow-md"
                style={{
                  background: isRecording ? '#ce2828' : '#ce2828',
                  color: '#ffffff',
                  opacity: isProcessing ? 0.6 : 1,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  animation: isRecording ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing) {
                    e.currentTarget.style.background = '#b02323';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ce2828';
                }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin" size={24} />
                    Processing Translation...
                  </>
                ) : isRecording ? (
                  <>
                    <Square size={24} />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic size={24} />
                    Start Speaking
                  </>
                )}
              </button>
            </div>

            {transcript && (
              <div
                className="rounded-lg p-5"
                style={{ background: '#f5f5f5', border: '1px solid #e0e0e0' }}
              >
                <p className="text-sm mb-2 font-medium" style={{ color: '#666666' }}>
                  Original Text:
                </p>
                <p className="text-lg leading-relaxed" style={{ color: '#212529' }}>
                  {transcript}
                </p>
              </div>
            )}
          </div>

          {/* Staff Side */}
          <div
            className="rounded-lg p-8 shadow-xl"
            style={{ background: '#ffffff', color: '#212529' }}
          >
            <h2 className="text-2xl font-medium mb-6 flex items-center gap-2">
              <span className="text-3xl">👨‍💼</span>
              <span>Receptionist</span>
            </h2>

            {translation ? (
              <div
                className="rounded-lg p-6"
                style={{
                  background: 'rgba(206, 40, 40, 0.08)',
                  border: '2px solid rgba(206, 40, 40, 0.2)'
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 size={22} style={{ color: '#ce2828' }} />
                  <p className="text-sm font-medium" style={{ color: '#666666' }}>
                    Translation (English):
                  </p>
                </div>
                <p className="text-2xl font-normal leading-relaxed" style={{ color: '#212529' }}>
                  {translation}
                </p>
              </div>
            ) : (
              <div
                className="rounded-lg p-8 text-center"
                style={{ background: '#f5f5f5', border: '1px solid #e0e0e0' }}
              >
                <p className="text-lg" style={{ color: '#666666' }}>
                  Waiting for driver audio...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}