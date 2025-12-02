// app/page.tsx

'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

type Message = {
  id: string;
  role: 'driver' | 'receptionist';
  originalText: string;
  originalLang: string;
  translatedText: string;
};

const LANGUAGES = [
  { code: 'nl', flag: 'NL', name: 'Nederlands' },
  { code: 'pl', flag: 'PL', name: 'Polski' },
  { code: 'ro', flag: 'RO', name: 'Română' },
  { code: 'bg', flag: 'BG', name: 'Български' },
  { code: 'tr', flag: 'TR', name: 'Türkçe' },
];

// Helper function to get supported audio MIME type
const getSupportedMimeType = (): { mimeType: string; extension: string } => {
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4', extension: 'mp4' };
  } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus', extension: 'webm' };
  }
  return { mimeType: 'audio/webm', extension: 'webm' };
};

// Helper function to play audio from base64
const playAudio = async (audioBase64: string) => {
  const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(audioData.buffer);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
};

const getLanguageName = (code: string) => {
  return LANGUAGES.find(l => l.code === code)?.name || code.toUpperCase();
};

export default function TranslatorPage() {
  const [selectedLang, setSelectedLang] = useState<string | null>(null); // null = AUTO
  const [detectedLang, setDetectedLang] = useState('nl');
  const [driverRecording, setDriverRecording] = useState({ isRecording: false, isProcessing: false });
  const [staffRecording, setStaffRecording] = useState({ isRecording: false, isProcessing: false });
  const [driverConversation, setDriverConversation] = useState<Message[]>([]);
  const [receptionistConversation, setReceptionistConversation] = useState<Message[]>([]);

  const driverMediaRecorder = useRef<MediaRecorder | null>(null);
  const driverAudioChunks = useRef<Blob[]>([]);
  const staffMediaRecorder = useRef<MediaRecorder | null>(null);
  const staffAudioChunks = useRef<Blob[]>([]);
  const driverScrollRef = useRef<HTMLDivElement>(null);
  const receptionistScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    driverScrollRef.current?.scrollTo({ top: driverScrollRef.current.scrollHeight });
  }, [driverConversation]);

  useEffect(() => {
    receptionistScrollRef.current?.scrollTo({ top: receptionistScrollRef.current.scrollHeight });
  }, [receptionistConversation]);

  // Unified recording function for both driver and staff
  const handleRecording = async (isDriver: boolean) => {
    const recorder = isDriver ? driverMediaRecorder : staffMediaRecorder;
    const chunks = isDriver ? driverAudioChunks : staffAudioChunks;
    const recordingState = isDriver ? driverRecording : staffRecording;
    const setRecordingState = isDriver ? setDriverRecording : setStaffRecording;

    // Stop recording if already recording
    if (recordingState.isRecording) {
      recorder.current?.stop();
      setRecordingState({ ...recordingState, isRecording: false });
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mimeType, extension } = getSupportedMimeType();

      recorder.current = new MediaRecorder(stream, { mimeType });
      chunks.current = [];

      recorder.current.ondataavailable = (event) => chunks.current.push(event.data);

      recorder.current.onstop = async () => {
        setRecordingState({ isRecording: false, isProcessing: true });

        const audioBlob = new Blob(chunks.current, { type: mimeType });
        const formData = new FormData();
        formData.append('audio', audioBlob, `recording.${extension}`);
        formData.append('targetLang', isDriver ? 'en' : (detectedLang || 'en'));

        try {
          const response = await fetch('/api/translate', { method: 'POST', body: formData });
          const result = await response.json();

          if (isDriver) {
            const actualLang = selectedLang || result.originalLanguage;
            setDetectedLang(actualLang);

            const message: Message = {
              id: Date.now().toString(),
              role: 'driver',
              originalText: result.originalText,
              originalLang: actualLang,
              translatedText: result.translatedText,
            };

            setDriverConversation(prev => [...prev, message]);
            setReceptionistConversation(prev => [...prev, { ...message, id: message.id + '-r' }]);
          } else {
            const message: Message = {
              id: Date.now().toString(),
              role: 'receptionist',
              originalText: result.originalText,
              originalLang: 'nl',
              translatedText: result.translatedText,
            };

            setReceptionistConversation(prev => [...prev, message]);
            setDriverConversation(prev => [...prev, { ...message, id: message.id + '-d' }]);
          }

          await playAudio(result.audioBase64);
        } catch (error) {
          console.error('Translation error:', error);
        } finally {
          setRecordingState({ isRecording: false, isProcessing: false });
        }
      };

      recorder.current.start();
      setRecordingState({ ...recordingState, isRecording: true });
    } catch (error) {
      console.error('Microphone access denied:', error);
    }
  };

  const clearConversation = () => {
    setDriverConversation([]);
    setReceptionistConversation([]);
    setDetectedLang('nl');
  };

  // Render chat bubble component
  const renderChatBubble = (msg: Message, viewerRole: 'driver' | 'receptionist') => {
    const isOwnMessage = msg.role === viewerRole;
    const senderLabel = viewerRole === 'driver'
      ? (msg.role === 'driver' ? 'Jij' : 'Receptionist')
      : (msg.role === 'receptionist' ? 'Jij' : 'Chauffeur');

    return (
      <div
        key={msg.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isOwnMessage ? 'flex-start' : 'flex-end',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '75%',
            padding: '16px 20px',
            borderRadius: '12px',
            background: isOwnMessage ? '#ce2828' : '#f5f5f5',
            color: isOwnMessage ? '#ffffff' : '#212529',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <p style={{ fontSize: '11px', opacity: 0.7, marginBottom: '6px', fontFamily: 'Roboto', fontWeight: '500', textTransform: 'uppercase' }}>
            {senderLabel}
          </p>
          <p style={{ fontSize: '16px', lineHeight: '1.5', fontFamily: 'Roboto', margin: 0 }}>
            {msg.originalText}
          </p>
        </div>
        <div
          style={{
            maxWidth: '75%',
            marginTop: '8px',
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.05)',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#666666',
            fontFamily: 'Roboto',
            fontStyle: 'italic',
          }}
        >
          {msg.translatedText}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ textAlign: 'center', padding: '32px 24px', borderBottom: '2px solid #ce2828', background: '#ffffff' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#212529', margin: 0, fontFamily: 'Roboto' }}>
          Railport Vertaling
        </h1>
        <p style={{ fontSize: '14px', color: '#666666', marginTop: '8px', fontFamily: 'Roboto' }}>
          AI Vertaling voor H. Essers
        </p>
      </header>

      {/* Split Screen Layout */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'row', gap: '2px', background: '#e0e0e0' }}>

        {/* Driver Side - Left */}
        <div style={{ flex: 1, background: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#212529', fontFamily: 'Roboto', margin: 0 }}>
              Chauffeur
            </h2>
            <button
              onClick={clearConversation}
              style={{
                padding: '8px 16px',
                background: '#ffffff',
                color: '#ce2828',
                border: '1px solid #ce2828',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: 'Roboto',
                transition: 'all 200ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ce2828';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#ce2828';
              }}
            >
              Wis Gesprek
            </button>
          </div>

          {/* Language Selector */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '12px', color: '#666666', marginBottom: '12px', textAlign: 'center', fontFamily: 'Roboto' }}>
              Selecteer Taal
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={() => setSelectedLang(null)}
                style={{
                  padding: '8px 16px',
                  background: selectedLang === null ? '#ce2828' : '#ffffff',
                  color: selectedLang === null ? '#ffffff' : '#212529',
                  border: `2px solid ${selectedLang === null ? '#ce2828' : '#e0e0e0'}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: 'Roboto',
                  transition: 'all 200ms',
                }}
              >
                AUTO
              </button>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  style={{
                    padding: '8px 16px',
                    background: selectedLang === lang.code ? '#ce2828' : '#ffffff',
                    color: selectedLang === lang.code ? '#ffffff' : '#212529',
                    border: `2px solid ${selectedLang === lang.code ? '#ce2828' : '#e0e0e0'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'Roboto',
                    transition: 'all 200ms',
                  }}
                  title={lang.name}
                >
                  {lang.flag}
                </button>
              ))}
            </div>
          </div>

          {/* Large Circular Button */}
          <button
            onClick={() => handleRecording(true)}
            disabled={driverRecording.isProcessing}
            className={driverRecording.isRecording ? 'pulse-glow' : ''}
            style={{
              width: '150px',
              height: '150px',
              borderRadius: '50%',
              background: '#ce2828',
              border: 'none',
              cursor: driverRecording.isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: driverRecording.isRecording ? '0 0 40px rgba(206, 40, 40, 0.6)' : '0 8px 32px rgba(0,0,0,0.3)',
              transition: 'all 300ms ease',
              opacity: driverRecording.isProcessing ? 0.7 : 1,
              animation: driverRecording.isRecording ? 'pulse 1.5s infinite' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!driverRecording.isProcessing && !driverRecording.isRecording) {
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!driverRecording.isRecording) {
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            {driverRecording.isProcessing ? (
              <Loader2 size={48} color="#ffffff" style={{ animation: 'spin 1s linear infinite' }} />
            ) : driverRecording.isRecording ? (
              <Square size={48} color="#ffffff" />
            ) : (
              <Mic size={48} color="#ffffff" />
            )}
          </button>

          <p style={{ marginTop: '24px', fontSize: '14px', color: '#666666', textAlign: 'center', fontFamily: 'Roboto' }}>
            {driverRecording.isProcessing ? 'Verwerken...' : driverRecording.isRecording ? 'Opnemen...' : selectedLang ? `Taal: ${getLanguageName(selectedLang)}` : 'Modus: AUTO'}
          </p>

          {/* Chat Bubbles */}
          <div
            ref={driverScrollRef}
            style={{
              marginTop: '48px',
              width: '100%',
              maxWidth: '600px',
              height: '500px',
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              overflowY: 'auto',
              boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
              border: '1px solid #e0e0e0',
            }}
          >
            {driverConversation.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999999', fontSize: '14px', fontFamily: 'Roboto', marginTop: '200px' }}>
                Chat wordt hier weergegeven...
              </p>
            ) : (
              driverConversation.map(msg => renderChatBubble(msg, 'driver'))
            )}
          </div>
        </div>

        {/* Receptionist Side - Right */}
        <div style={{ flex: 1, background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 32px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#212529', marginBottom: '32px', fontFamily: 'Roboto' }}>
            Receptionist
          </h2>

          {/* Chat Bubbles */}
          <div
            ref={receptionistScrollRef}
            style={{
              width: '100%',
              maxWidth: '600px',
              height: '500px',
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              overflowY: 'auto',
              boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
              border: '1px solid #e0e0e0',
              marginBottom: '32px',
            }}
          >
            {receptionistConversation.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999999', fontSize: '14px', fontFamily: 'Roboto', marginTop: '200px' }}>
                Chat wordt hier weergegeven...
              </p>
            ) : (
              receptionistConversation.map(msg => renderChatBubble(msg, 'receptionist'))
            )}
          </div>

          {/* Staff Response Button */}
          {detectedLang && (
            <button
              onClick={() => handleRecording(false)}
              disabled={staffRecording.isProcessing}
              style={{
                padding: '12px 32px',
                background: '#ce2828',
                color: '#ffffff',
                border: 'none',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: 'Roboto',
                cursor: staffRecording.isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                transition: 'all 300ms ease',
                opacity: staffRecording.isProcessing ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!staffRecording.isProcessing) {
                  e.currentTarget.style.background = '#b02323';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ce2828';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {staffRecording.isProcessing ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Verwerken...
                </>
              ) : staffRecording.isRecording ? (
                <>
                  <Square size={16} />
                  Stop
                </>
              ) : (
                <>
                  <Mic size={16} />
                  Reply in {getLanguageName(detectedLang)}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
