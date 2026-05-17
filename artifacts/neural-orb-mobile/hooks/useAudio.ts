import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";

export function useAudio() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isDenied, setIsDenied] = useState(false);

  const startMic = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setIsDenied(true);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          android: {
            extension: ".m4a",
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: ".m4a",
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MAX,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: "audio/webm",
            bitsPerSecond: 128000,
          },
        },
        (status) => {
          if (status.isRecording && status.metering !== undefined) {
            // Baseline -40dBFS so ambient noise stays at 0.
            // Mild 1.3-power curve: more linear near speech levels so the
            // orb tracks voice dynamics naturally without feeling compressed.
            const raw = Math.max(0, Math.min(1, (status.metering + 40) / 40));
            const level = Math.min(1, Math.pow(raw, 1.3) * 1.15);
            setAudioLevel(level);
          }
        },
        50
      );

      recordingRef.current = recording;
      setIsActive(true);
    } catch (e) {
      console.warn("Mic error:", e);
      setIsDenied(true);
    }
  };

  const stopMic = async () => {
    try {
      await recordingRef.current?.stopAndUnloadAsync();
      recordingRef.current = null;
      setIsActive(false);
      setAudioLevel(0);
    } catch (e) {
      console.warn("Stop mic error:", e);
    }
  };

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  return { audioLevel, isActive, isDenied, startMic, stopMic };
}
