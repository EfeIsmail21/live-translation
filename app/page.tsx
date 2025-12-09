// app/page.tsx

'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Volume2, Pause } from 'lucide-react';

type Message = {
  id: string;
  role: 'driver' | 'counter';
  originalText: string;
  originalLang: string;
  translatedText: string;
  audioBase64: string; // Store audio for replay
};

// Helper function to get supported audio MIME type
const getSupportedMimeType = (): { mimeType: string; extension: string } => {
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4', extension: 'mp4' };
  } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus', extension: 'webm' };
  }
  return { mimeType: 'audio/webm', extension: 'webm' };
};

export default function TranslatorPage() {
  const [detectedDriverLang, setDetectedDriverLang] = useState<string>('');
  const [driverRecording, setDriverRecording] = useState({ isRecording: false, isProcessing: false });
  const [counterRecording, setCounterRecording] = useState({ isRecording: false, isProcessing: false });
  const [conversation, setConversation] = useState<Message[]>([]);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const driverMediaRecorder = useRef<MediaRecorder | null>(null);
  const driverAudioChunks = useRef<Blob[]>([]);
  const counterMediaRecorder = useRef<MediaRecorder | null>(null);
  const counterAudioChunks = useRef<Blob[]>([]);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  // Audio playback control
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const currentAudioContext = useRef<AudioContext | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    conversationScrollRef.current?.scrollTo({
      top: conversationScrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [conversation]);

  // Keyboard shortcuts for accessibility
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Space bar for counter employee (right side)
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        handleRecording(false);
      }
      // 'D' key for driver (left side)
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleRecording(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [driverRecording, counterRecording, detectedDriverLang]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  // Helper function to stop current audio
  const stopCurrentAudio = () => {
    if (currentAudioSource.current) {
      try {
        currentAudioSource.current.stop();
      } catch (e) {
        // Audio already stopped
      }
      currentAudioSource.current = null;
    }
    if (currentAudioContext.current) {
      currentAudioContext.current.close();
      currentAudioContext.current = null;
    }
    setPlayingMessageId(null);
  };

  // Helper function to play audio from base64
  const playAudio = async (audioBase64: string, messageId: string) => {
    try {
      // Stop any currently playing audio
      stopCurrentAudio();

      const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(audioData.buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      // Store references for pause/stop control
      currentAudioSource.current = source;
      currentAudioContext.current = audioContext;
      setPlayingMessageId(messageId);

      // Auto-clear playing state when audio ends
      source.onended = () => {
        currentAudioSource.current = null;
        currentAudioContext.current = null;
        setPlayingMessageId(null);
      };

      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
      setPlayingMessageId(null);
    }
  };

  // Unified recording function for both driver and counter
  const handleRecording = async (isDriver: boolean) => {
    const recorder = isDriver ? driverMediaRecorder : counterMediaRecorder;
    const chunks = isDriver ? driverAudioChunks : counterAudioChunks;
    const recordingState = isDriver ? driverRecording : counterRecording;
    const setRecordingState = isDriver ? setDriverRecording : setCounterRecording;

    // Stop recording if already recording
    if (recordingState.isRecording) {
      recorder.current?.stop();
      setRecordingState({ ...recordingState, isRecording: false });
      return;
    }

    // Don't allow new recording while processing
    if (recordingState.isProcessing) {
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

        // Driver speaks their language, translates to Dutch
        // Counter speaks Dutch, translates to driver's detected language
        formData.append('targetLang', isDriver ? 'nl' : (detectedDriverLang || 'nl'));

        try {
          const response = await fetch('/api/translate', { method: 'POST', body: formData });
          const result = await response.json();

          if (isDriver) {
            // Store detected language for future counter responses
            setDetectedDriverLang(result.originalLanguage);

            const message: Message = {
              id: Date.now().toString(),
              role: 'driver',
              originalText: result.originalText,
              originalLang: result.originalLanguage,
              translatedText: result.translatedText,
              audioBase64: result.audioBase64,
            };

            setConversation(prev => [...prev, message]);
            await playAudio(result.audioBase64, message.id);
          } else {
            const message: Message = {
              id: Date.now().toString(),
              role: 'counter',
              originalText: result.originalText,
              originalLang: 'nl',
              translatedText: result.translatedText,
              audioBase64: result.audioBase64,
            };

            setConversation(prev => [...prev, message]);
            await playAudio(result.audioBase64, message.id);
          }
        } catch (error) {
          console.error('Translation error:', error);
          alert('Er is een fout opgetreden. Probeer het opnieuw.');
        } finally {
          setRecordingState({ isRecording: false, isProcessing: false });
        }

        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.current.start();
      setRecordingState({ ...recordingState, isRecording: true });
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Geen toegang tot microfoon. Controleer uw instellingen.');
    }
  };

  const clearConversation = () => {
    if (window.confirm('Weet u zeker dat u het gesprek wilt wissen?')) {
      stopCurrentAudio();
      setConversation([]);
      setDetectedDriverLang('');
    }
  };

  const handleToggleAudio = async (messageId: string, audioBase64: string) => {
    // If this message is currently playing, stop it
    if (playingMessageId === messageId) {
      stopCurrentAudio();
    } else {
      // Otherwise, play this message
      await playAudio(audioBase64, messageId);
    }
  };

  // Render message component
  const renderMessage = (msg: Message) => {
    const isDriver = msg.role === 'driver';
    const isPlaying = playingMessageId === msg.id;

    return (
      <div
        key={msg.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isDriver ? 'flex-start' : 'flex-end',
          marginBottom: '24px',
          width: '100%',
        }}
      >
        {/* Main text bubble with play/pause button */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', maxWidth: '75%', flexDirection: isDriver ? 'row' : 'row-reverse' }}>
          <div
            style={{
              flex: 1,
              padding: '20px 24px',
              borderRadius: '16px',
              background: isDriver ? '#4a90e2' : '#ce2828',
              color: '#ffffff',
              fontSize: '22px',
              lineHeight: '1.5',
              fontFamily: 'Roboto',
              fontWeight: '500',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            {msg.originalText}
          </div>

          {/* Play/Pause button */}
          <button
            onClick={() => handleToggleAudio(msg.id, msg.audioBase64)}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: isDriver ? '#4a90e2' : '#ce2828',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              transition: 'all 200ms ease',
              flexShrink: 0,
              marginTop: '16px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={isPlaying ? "Pauzeer bericht" : "Speel bericht af"}
          >
            {isPlaying ? (
              <Pause size={24} color="#ffffff" fill="#ffffff" />
            ) : (
              <Volume2 size={24} color="#ffffff" />
            )}
          </button>
        </div>

        {/* Light translation underneath */}
        <div
          style={{
            maxWidth: '75%',
            marginTop: '8px',
            paddingLeft: isDriver ? '12px' : '0',
            paddingRight: isDriver ? '0' : '12px',
            fontSize: '15px',
            color: '#666666',
            fontFamily: 'Roboto',
            opacity: 0.85,
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
      <header style={{
        textAlign: 'center',
        padding: '24px',
        borderBottom: '2px solid #ce2828',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <h1 style={{ fontSize: '42px', fontWeight: 'bold', color: '#212529', margin: 0, fontFamily: 'Roboto' }}>
          GateTalk
        </h1>
        <button
          onClick={clearConversation}
          style={{
            padding: '10px 20px',
            background: '#ffffff',
            color: '#ce2828',
            border: '2px solid #ce2828',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
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
      </header>

      {/* Main Layout: Left Mic | Conversation | Right Mic */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '24px',
        padding: '32px 24px',
        alignItems: 'stretch',
        background: '#f5f5f5'
      }}>

        {/* Left Side - Driver Mic */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          minWidth: '220px'
        }}>
          <h3 style={{
            fontSize: '22px',
            fontWeight: 'bold',
            color: '#4a90e2',
            fontFamily: 'Roboto',
            marginBottom: '8px'
          }}>
            Chauffeur
          </h3>

          <button
            onClick={() => handleRecording(true)}
            disabled={driverRecording.isProcessing}
            className={driverRecording.isRecording ? 'pulse-glow' : ''}
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: driverRecording.isProcessing ? '#999999' : '#4a90e2',
              border: 'none',
              cursor: driverRecording.isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: driverRecording.isRecording ? '0 0 40px rgba(74, 144, 226, 0.6)' : '0 8px 32px rgba(0,0,0,0.2)',
              transition: 'all 300ms ease',
              opacity: driverRecording.isProcessing ? 0.7 : 1,
              animation: driverRecording.isRecording ? 'pulse 1.5s infinite' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!driverRecording.isProcessing && !driverRecording.isRecording) {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)';
              }
            }}
            onMouseLeave={(e) => {
              if (!driverRecording.isRecording) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
              }
            }}
          >
            {driverRecording.isProcessing ? (
              <Loader2 size={56} color="#ffffff" style={{ animation: 'spin 1s linear infinite' }} />
            ) : driverRecording.isRecording ? (
              <Square size={56} color="#ffffff" />
            ) : (
              <Mic size={56} color="#ffffff" />
            )}
          </button>

          <p style={{
            fontSize: '15px',
            color: '#666666',
            textAlign: 'center',
            fontFamily: 'Roboto',
            marginTop: '8px',
            fontWeight: '500'
          }}>
            {driverRecording.isProcessing ? 'Verwerken...' : driverRecording.isRecording ? 'Bezig met opnemen...' : 'Druk D of klik'}
          </p>
        </div>

        {/* Center - Conversation Area */}
        <div
          ref={conversationScrollRef}
          style={{
            flex: 1,
            background: '#ffffff',
            borderRadius: '16px',
            padding: '40px',
            overflowY: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
            border: '1px solid #e0e0e0',
            display: 'flex',
            flexDirection: 'column',
            minWidth: '0', // Important for flex overflow
          }}
        >
          {conversation.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#999999',
              fontSize: '18px',
              fontFamily: 'Roboto',
              gap: '16px'
            }}>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: '500' }}>Welkom bij GateTalk</p>
              <p style={{ margin: 0, fontSize: '16px', textAlign: 'center', maxWidth: '400px' }}>
                Klik op de microfoon of gebruik de sneltoets om een gesprek te starten
              </p>
            </div>
          ) : (
            conversation.map(msg => renderMessage(msg))
          )}
        </div>

        {/* Right Side - Counter Mic */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          minWidth: '220px'
        }}>
          <h3 style={{
            fontSize: '22px',
            fontWeight: 'bold',
            color: '#ce2828',
            fontFamily: 'Roboto',
            marginBottom: '8px'
          }}>
            Balie
          </h3>

          <button
            onClick={() => handleRecording(false)}
            disabled={counterRecording.isProcessing}
            className={counterRecording.isRecording ? 'pulse-glow' : ''}
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: counterRecording.isProcessing ? '#999999' : '#ce2828',
              border: 'none',
              cursor: counterRecording.isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: counterRecording.isRecording ? '0 0 40px rgba(206, 40, 40, 0.6)' : '0 8px 32px rgba(0,0,0,0.2)',
              transition: 'all 300ms ease',
              opacity: counterRecording.isProcessing ? 0.7 : 1,
              animation: counterRecording.isRecording ? 'pulse 1.5s infinite' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!counterRecording.isProcessing && !counterRecording.isRecording) {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)';
              }
            }}
            onMouseLeave={(e) => {
              if (!counterRecording.isRecording) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
              }
            }}
          >
            {counterRecording.isProcessing ? (
              <Loader2 size={56} color="#ffffff" style={{ animation: 'spin 1s linear infinite' }} />
            ) : counterRecording.isRecording ? (
              <Square size={56} color="#ffffff" />
            ) : (
              <Mic size={56} color="#ffffff" />
            )}
          </button>

          <p style={{
            fontSize: '15px',
            color: '#666666',
            textAlign: 'center',
            fontFamily: 'Roboto',
            marginTop: '8px',
            fontWeight: '500'
          }}>
            {counterRecording.isProcessing ? 'Verwerken...' : counterRecording.isRecording ? 'Bezig met opnemen...' : 'Druk SPATIE of klik'}
          </p>
        </div>

      </div>
    </div>
  );
}
