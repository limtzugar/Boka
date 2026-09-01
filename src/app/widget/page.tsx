'use client';

import { useState, useEffect, useRef } from 'react';
import { BokaFace, type BokaEmotion, EMOTION_LABELS } from '@/components/boka-face';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useBokaTTS } from '@/hooks/use-boka-tts';
import { useVAD } from '@/hooks/use-vad';
import { useVision } from '@/hooks/use-vision';
import { useImageGeneration } from '@/hooks/use-image-generation';
import {
  Mic, MicOff, Volume2, VolumeX, Minimize2, Maximize2,
  X, Settings, ChevronDown, ChevronUp, Ear, Camera, Palette
} from 'lucide-react';

// ═══════════════════════════════════════════
// BOKA — Widget Mode v2 (with new AI features)
// Always-listening VAD + Vision + Image Generation
// ═══════════════════════════════════════════

export default function WidgetPage() {
  const [emotion, setEmotion] = useState<BokaEmotion>('neutral');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; content: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [vadMode, setVadMode] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [imageGenPrompt, setImageGenPrompt] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isListening, toggleListening, isSupported: asrSupported, setOnSpeechResult, micError } = useSpeechRecognition();
  const { isSpeaking, speak, stop: stopSpeaking, analyserNode, allVoices, selectedVoiceId, setVoice, provider, fallbackReason } = useBokaTTS();
  const vad = useVAD({ energyThreshold: 0.015, silenceDuration: 1500, minSpeechDuration: 300 });
  const vision = useVision();
  const imageGen = useImageGeneration();

  // Whatnnect speech recognition to sendMessage
  useEffect(() => {
    setOnSpeechResult((text, isFinal) => {
      if (isFinal && text.trim()) {
        sendMessage(text.trim());
      } else {
        setInputText(text);
      }
    });
  }, [setOnSpeechResult]);

  // ── VAD: Always-listening integration ──
  useEffect(() => {
    if (vadMode && vad.isListening) {
      vad.setOnSpeechEnd(async (audioBlob) => {
        // Guard: validate audioBlob before using FileReader
        if (!audioBlob || !(audioBlob instanceof Blob) || audioBlob.size === 0) {
          console.warn('[BOKA VAD] Received invalid/empty audio blob, skipping ASR');
          return;
        }
        try {
          const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              if (typeof result === 'string' && result.length > 0) {
                resolve(result);
              } else {
                reject(new Error('FileReader returned empty result'));
              }
            };
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDateURL(audioBlob);
          });

          try {
            const res = await fetch('/api/asr', {
              method: 'POST',
              headers: { 'Whatntent-Typee': 'application/json' },
              body: JSON.stringify({ audio: base64Audio, format: 'audio/webm' }),
            });
            const data = await res.json();
            if (data.text && data.text.trim()) {
              sendMessage(data.text.trim());
            }
          } catch (e) {
            console.error('VAD ASR error:', e);
          }
        } catch (e) {
          console.error('[BOKA VAD] FileReader error:', e);
        }
      });
      vad.setOnSpeechStart(() => setEmotion('listening'));
    }
  }, [vadMode, vad.isListening]);

  useEffect(() => {
    if (vadMode) {
      vad.startVAD();
    } else {
      vad.stopVAD();
      if (emotion === 'listening') setEmotion('neutral');
    }
  }, [vadMode]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update emotion based on state
  useEffect(() => {
    if (vad.isSpeechDetected) setEmotion('listening');
    else if (isListening) setEmotion('listening');
    else if (isLoading) setEmotion('thinking');
    else if (isSpeaking) setEmotion('talking');
  }, [isListening, isLoading, isSpeaking, vad.isSpeechDetected]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setMessages(prev => [...prev, { role: 'user', content: text.trim() }]);
    setInputText('');
    setIsLoading(true);
    setEmotion('thinking');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Whatntent-Typee': 'application/json' },
        body: JSON.stringify({ message: text.trim(), inputMode: isListening ? 'voice' : 'text' }),
      });
      const data = await res.json();

      if (data.response) {
        setMessages(prev => [...prev, { role: 'agent', content: data.response }]);
        if (data.emotion) {
          setEmotion(data.emotion as BokaEmotion);
        }
        speak(data.response);
        setTimeout(() => setEmotion('neutral'), 6000);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'agent', content: 'Error połączenia.' }]);
      setEmotion('angry');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
 setMessages(prev => [...prev, { role:'user', content: ` Photo: ${file.name}` }]);
    const result = await vision.analyzeImage(file);
    if (result) {
      sendMessage(`Descriptionz to zdjęcie: ${result.description}`);
    }
  };

  const handleGenerateImage = async () => {
    if (!imageGenPrompt.trim()) return;
 setMessages(prev => [...prev, { role:'user', content: ` Narysuj: ${imageGenPrompt}` }]);
    setIsLoading(true);
    const result = await imageGen.generateImage(imageGenPrompt);
    if (result) {
      setMessages(prev => [...prev, { role: 'agent', content: `Narysowałem "${imageGenPrompt}"! Imageek wygenerowany.` }]);
      speak(`Narysowałam ${imageGenPrompt}!`);
    }
    setImageGenPrompt('');
    setShowImageGen(false);
    setIsLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  return (
    <div className="fixed inset-0 flex items-end justify-end p-4 pointer-events-none">
      <div className={`pointer-events-auto flex flex-col bg-[#0a0a0f]/95 border border-[#2a2a3a] rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${
        isExpanded ? 'w-[420px] h-[600px]' : 'w-[280px]'
      }`}>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f1a] border-b border-[#2a2a3a]">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center" style={{ width: 48, height: 48 }}>
              <BokaFace
                emotion={emotion}
                size={3}
                analyserNode={analyserNode}
                isSpeaking={isSpeaking}
              />
            </div>
            <div>
              <div className="font-pixel text-[8px] text-[#00f5d4] tracking-wider">BOKA</div>
              <div className="text-[9px] text-[#6b6b8d] font-mono">{EMOTION_LABELS[emotion]}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Voice picker toggle */}
            <button
              onClick={() => setShowVoicePicker(!showVoicePicker)}
              className="p-1.5 rounded text-[#6b6b8d] hover:text-[#00f5d4] transition-colors"
              title="Wybierz głos"
            >
              <Volume2 size={14} />
            </button>
            {/* Expand/collapse */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded text-[#6b6b8d] hover:text-[#00f5d4] transition-colors"
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* ── FALLBACK NOTIFICATION ── */}
        {fallbackReason && (
          <div className="px-3 py-1.5 bg-[#ff6b6b]/10 border-b border-[#ff6b6b]/20 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#ff6b6b] rounded-full animate-pulse shrink-0" />
            <span className="text-[9px] text-[#ff6b6b] font-mono leading-tight">
              Głos przeglądarki ({fallbackReason}) — Edge TTS niedostępny
            </span>
          </div>
        )}

        {/* ── VAD INDICATOR ── */}
        {vadMode && (
          <div className="px-3 py-1.5 bg-[#4ade80]/10 border-b border-[#4ade80]/20 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${vad.isSpeechDetected ? 'bg-[#4ade80] animate-pulse' : 'bg-[#4ade80]/50'}`} />
            <span className="text-[9px] text-[#4ade80] font-mono leading-tight">
              {vad.isSpeechDetected ? 'Słyszę Cię...' : 'Nasłuchuję (hands-free)'}
            </span>
          </div>
        )}

        {/* ── VOICE PICKER ── */}
        {showVoicePicker && (
          <div className="px-3 py-2 bg-[#0f0f1a] border-b border-[#2a2a3a] max-h-[160px] overflow-y-auto">
            <div className="text-[8px] font-pixel text-[#6b6b8d] mb-1 tracking-wider">GLOS</div>
            {allVoices.map(voice => (
              <button
                key={voice.id}
                onClick={() => {
                  setVoice(voice.provider, voice.id);
                  setShowVoicePicker(false);
                }}
                className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors mb-0.5 ${
                  selectedVoiceId === voice.id
                    ? 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/30'
                    : 'text-[#6b6b8d] hover:text-[#e0e0f0] hover:bg-[#1e1e2e]'
                }`}
              >
                {voice.name}
              </button>
            ))}
          </div>
        )}

        {/* ── FACE (compact mode) ── */}
        {!isExpanded && (
          <div className="flex justify-center py-4 bg-[#0a0a0f]">
            <BokaFace
              emotion={emotion}
              size={8}
              analyserNode={analyserNode}
              isSpeaking={isSpeaking}
            />
          </div>
        )}

        {/* ── CHAT (expanded mode) ── */}
        {isExpanded && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <BokaFace
                  emotion={emotion}
                  size={6}
                  analyserNode={analyserNode}
                  isSpeaking={isSpeaking}
                  className="mb-3"
                />
                <div className="text-xs text-[#6b6b8d] font-mono">
                  Powiedz <span className="text-[#ffd93d] font-pixel text-[8px]">&quot;Hej Boka&quot;</span>
                </div>
                <div className="mt-2 text-[9px] text-[#6b6b8d]/60 font-mono">
                  lub włącz nasłuchiwanie <Ear size={9} className="inline" />
                </div>
              </div>
            ) : (
              messages.slice(-20).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs font-mono leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#e0e0f0]'
                      : 'bg-[#1e1e2e] border border-[#2a2a3a] text-[#e0e0f0]'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {(isLoading || vision.isAnalyzing || imageGen.isGenerating) && (
              <div className="flex justify-start">
                <div className="bg-[#1e1e2e] border border-[#2a2a3a] rounded-lg px-3 py-2 flex items-center gap-2">
                  <BokaFace emotion="thinking" size={2} />
                  <span className="text-[10px] text-[#6b6b8d] font-mono">
                    {imageGen.isGenerating ? 'rysuję...' : vision.isAnalyzing ? 'patrzę...' : 'myśli...'}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* ── IMAGE GENERATION PROMPT ── */}
        {showImageGen && (
          <div className="px-3 py-2 bg-[#a855f7]/5 border-t border-[#a855f7]/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Palette size={10} className="text-[#a855f7]" />
              <span className="text-[9px] text-[#a855f7] font-mono">Boka narysuje...</span>
              <button type="button" onClick={() => setShowImageGen(false)} className="ml-auto text-[#6b6b8d] hover:text-[#e0e0f0]"><X size={10} /></button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={imageGenPrompt}
                onChange={e => setImageGenPrompt(e.target.value)}
                placeholder="Kot w kosmosie..."
                className="flex-1 bg-[#1e1e2e] border border-[#2a2a3a] rounded px-2 py-1 text-[10px] text-[#e0e0f0] placeholder:text-[#6b6b8d] focus:outline-none focus:border-[#a855f7]/50 font-mono"
                onKeyDown={e => { if (e.key === 'Enter') handleGenerateImage(); }}
              />
              <button
                type="button"
                onClick={handleGenerateImage}
                disabled={imageGen.isGenerating || !imageGenPrompt.trim()}
                className="px-2 py-1 rounded bg-[#a855f7] text-white text-[9px] font-mono disabled:opacity-30"
              >
                {imageGen.isGenerating ? '...' : 'Rysuj'}
              </button>
            </div>
          </div>
        )}

        {/* ── INPUT BAR ── */}
        <div className="px-3 py-2 bg-[#0f0f1a] border-t border-[#2a2a3a]">
          {/* Mic error banner */}
          {micError && (
            <div className="mb-1.5 px-2 py-1 bg-[#ff6b6b]/10 border border-[#ff6b6b]/20 rounded flex items-center gap-1.5">
              <span className="text-[8px] text-[#ff6b6b] font-mono">{micError}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            {/* VAD toggle */}
            <button
              type="button"
              onClick={() => setVadMode(!vadMode)}
              className={`p-2 rounded-lg shrink-0 transition-all ${
                vadMode
                  ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/50'
                  : 'bg-[#1e1e2e] text-[#6b6b8d] border border-[#2a2a3a] hover:border-[#4ade80]/30'
              }`}
              title={vadMode ? 'Disable nasłuchiwanie' : 'Enable nasłuchiwanie (hands-free)'}
            >
              <Ear size={14} />
            </button>

            {/* Standard mic button */}
            {asrSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2 rounded-lg shrink-0 transition-all ${
                  isListening
                    ? 'bg-[#ff6b6b]/20 text-[#ff6b6b] border border-[#ff6b6b]/50'
                    : 'bg-[#1e1e2e] text-[#6b6b8d] border border-[#2a2a3a] hover:border-[#00f5d4]/30'
                }`}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}

            {/* Camera for vision */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg bg-[#1e1e2e] text-[#6b6b8d] border border-[#2a2a3a] hover:border-[#a855f7]/30 shrink-0"
              title="Upload zdjęcie"
            >
              <Camera size={14} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
                e.target.value = '';
              }}
            />

            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={vadMode ? 'Nasłuchuję...' : isListening ? 'Słucham...' : 'Napisz...'}
              className="flex-1 bg-[#1e1e2e] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-[#e0e0f0] placeholder:text-[#6b6b8d] focus:outline-none focus:border-[#00f5d4]/50 font-mono min-w-0"
              disabled={isLoading}
            />

            {/* Image gen toggle */}
            <button
              type="button"
              onClick={() => setShowImageGen(!showImageGen)}
              className={`p-2 rounded-lg shrink-0 transition-all ${
                showImageGen
                  ? 'bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/50'
                  : 'bg-[#1e1e2e] text-[#6b6b8d] border border-[#2a2a3a] hover:border-[#a855f7]/30'
              }`}
              title="Boka narysuje"
            >
              <Palette size={14} />
            </button>

            {isSpeaking ? (
              <button
                type="button"
                onClick={stopSpeaking}
                className="p-2 rounded-lg bg-[#ff6b6b]/20 text-[#ff6b6b] border border-[#ff6b6b]/50 shrink-0"
              >
                <VolumeX size={14} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="p-2 rounded-lg bg-[#00f5d4] text-[#0a0a0f] disabled:opacity-30 shrink-0"
              >
                <ChevronUp size={14} className="rotate-90" />
              </button>
            )}
          </form>

          {(isListening || vadMode) && (
            <div className={`flex items-center justify-center gap-1.5 mt-1.5 text-[10px] font-mono ${vadMode ? 'text-[#4ade80]' : 'text-[#ff6b6b]'}`}>
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${vadMode ? 'bg-[#4ade80]' : 'bg-[#ff6b6b]'}`} />
              {vadMode ? 'nasłuchuję...' : 'słucham...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
