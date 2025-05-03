import React, { useState, useRef, useEffect } from 'react';
import { FaMicrophone, FaStop, FaTrash } from 'react-icons/fa';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onCancel: () => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onRecordingComplete,
  onCancel
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check your browser permissions.');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };
  
  const handleSubmit = () => {
    if (audioBlob) {
      onRecordingComplete(audioBlob);
      resetRecording();
    }
  };
  
  const resetRecording = () => {
    setAudioBlob(null);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex flex-col items-center gap-2">
      {!audioBlob ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`rounded-full w-12 h-12 flex items-center justify-center ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white`}
            >
              {isRecording ? <FaStop /> : <FaMicrophone />}
            </button>
            {isRecording && (
              <div className="text-red-500 font-medium animate-pulse">
                Recording... {formatTime(recordingTime)}
              </div>
            )}
          </div>
          {isRecording && (
            <button 
              onClick={onCancel} 
              className="text-gray-500 text-sm underline"
            >
              Cancel
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <audio src={URL.createObjectURL(audioBlob)} controls className="w-full" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
            >
              Send
            </button>
            <button
              type="button"
              onClick={resetRecording}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded flex items-center gap-1"
            >
              <FaTrash size={12} /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder; 