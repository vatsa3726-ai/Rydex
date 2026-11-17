import { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { api, request } from "../../lib/api";
import {
  type Companion,
  type Configuration,
  type Message,
} from "../../lib/domain";
import {
  Body,
  Button,
  Card,
  Choices,
  ErrorText,
  Field,
  RequireUser,
  Screen,
  Title,
} from "../../components/ui";
type Phase =
  "idle" | "recording" | "transcribing" | "review" | "sending" | "speaking";
function VoiceConversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY),
    player = useAudioPlayer(null),
    status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<Phase>("idle"),
    [companion, setCompanion] = useState<Companion | null>(null),
    [ready, setReady] = useState(false),
    [voice, setVoice] = useState("alloy"),
    [transcript, setTranscript] = useState(""),
    [reply, setReply] = useState(""),
    [error, setError] = useState("");
  const mounted = useRef(true),
    generation = useRef(0),
    recordUri = useRef(""),
    speechFile = useRef<File | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    finishing = useRef(false),
    pending = useRef<{ id: string; text: string } | null>(null);
  function deleteRecording() {
    try {
      const uri = recordUri.current || recorder.uri;
      if (uri) {
        const f = new File(uri);
        if (f.exists) f.delete();
      }
    } catch {}
    recordUri.current = "";
  }
  function deleteSpeech() {
    try {
      if (speechFile.current?.exists) speechFile.current.delete();
    } catch {}
    speechFile.current = null;
  }
  async function cancel() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    player.pause();
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {}
    deleteRecording();
    deleteSpeech();
    if (mounted.current) setPhase("idle");
  }
  useEffect(() => {
    mounted.current = true;
    void Promise.all([
      api<{ companion: Companion }>(`companions/${id}`),
      api<Configuration>("config"),
    ])
      .then(([c, config]) => {
        if (mounted.current) {
          setCompanion(c.companion);
          setReady(config.voiceEnabled);
        }
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") void cancel();
    });
    return () => {
      mounted.current = false;
      listener.remove();
      void cancel();
    };
  }, [id]);
  useEffect(() => {
    if (status.didJustFinish) {
      deleteSpeech();
      setPhase("idle");
    }
  }, [status.didJustFinish]);
  async function record() {
    setError("");
    const version = generation.current;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw Error(
          "Microphone permission is off. Enable it in phone settings, or use text chat.",
        );
      if (!mounted.current || version !== generation.current) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix",
      });
      await recorder.prepareToRecordAsync();
      if (!mounted.current || version !== generation.current) return;
      recorder.record({ forDuration: 45 });
      setPhase("recording");
      timer.current = setTimeout(() => void transcribe(), 44000);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }
  async function transcribe() {
    if (finishing.current) return;
    finishing.current = true;
    const version = generation.current;
    setError("");
    setPhase("transcribing");
    if (timer.current) clearTimeout(timer.current);
    try {
      if (recorder.isRecording) await recorder.stop();
      recordUri.current = recorder.uri ?? "";
      if (!recordUri.current)
        throw Error("No recording was captured. Please try again.");
      const file = new File(recordUri.current);
      if (file.size > 5 * 1024 * 1024)
        throw Error("The recording is too large. Try a shorter message.");
      const base64 = await file.base64();
      deleteRecording();
      if (version !== generation.current || !mounted.current) return;
      const data = await api<{ text: string }>(
        `companions/${id}/transcribe`,
        "POST",
        { base64, mime: "audio/mp4" },
      );
      if (version !== generation.current || !mounted.current) return;
      setTranscript(data.text);
      setPhase("review");
    } catch (e) {
      deleteRecording();
      if (version === generation.current && mounted.current) {
        setError((e as Error).message);
        setPhase("idle");
      }
    } finally {
      finishing.current = false;
    }
  }
  async function send() {
    const version = generation.current;
    setError("");
    setPhase("sending");
    try {
      if (pending.current?.text !== transcript.trim())
        pending.current = { id: Crypto.randomUUID(), text: transcript.trim() };
      const data = await api<{ content: string }>(
        `companions/${id}/chat`,
        "POST",
        { content: pending.current.text, requestId: pending.current.id },
      );
      if (version !== generation.current || !mounted.current) return;
      setReply(data.content);
      setTranscript("");
      pending.current = null;
      const history = await api<{ messages: Message[] }>(
        `companions/${id}/messages`,
      );
      const latest = [...history.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!latest)
        throw Error("Your reply is saved in chat. Audio is not ready.");
      const audio = await request(`companions/${id}/speech`, "POST", {
        messageId: String(latest.id),
        voice,
      });
      if (!audio.ok)
        throw Error(
          (await audio.json()).error ??
            "The reply is saved in chat, but speech is unavailable.",
        );
      const bytes = new Uint8Array(await audio.arrayBuffer());
      if (version !== generation.current || !mounted.current) return;
      deleteSpeech();
      const file = new File(
        Paths.cache,
        `soulnest-speech-${Crypto.randomUUID()}.mp3`,
      );
      await file.write(bytes);
      speechFile.current = file;
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix",
      });
      if (version !== generation.current || !mounted.current) {
        deleteSpeech();
        return;
      }
      player.replace({ uri: file.uri });
      player.play();
      setPhase("speaking");
    } catch (e) {
      if (mounted.current && version === generation.current) {
        setError((e as Error).message);
        setPhase(pending.current ? "review" : "idle");
      }
    }
  }
  const busy = phase === "transcribing" || phase === "sending";
  return (
    <Screen>
      <Title eyebrow="AI VOICE · TURN BY TURN">
        {companion?.name ?? "Your companion"}
      </Title>
      <Body>
        Speak, review your words, then hear an AI-generated reply. This is an AI
        conversation, not a telephone call to a real person.
      </Body>
      <View
        style={{
          height: 140,
          borderRadius: 80,
          backgroundColor: "#E7ECD9",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 56, color: "#315B47" }}>
          {phase === "recording" ? "◉" : "✧"}
        </Text>
        <Body small>
          {phase === "recording"
            ? "Listening · 45-second maximum"
            : phase === "speaking"
              ? "Speaking · synthetic AI voice"
              : busy
                ? "One moment…"
                : "At your pace"}
        </Body>
      </View>
      <Choices
        label="Built-in synthetic voice"
        items={[
          ["alloy", "Alloy"],
          ["coral", "Coral"],
          ["sage", "Sage"],
        ]}
        value={voice}
        onChange={(v) => {
          if (phase === "idle" || phase === "review") setVoice(v);
        }}
      />
      {!ready && (
        <Card>
          <Body small>
            Speech is not configured on the API yet. You can keep using text
            chat. No real-person voice cloning is available.
          </Body>
        </Card>
      )}
      <Body small>
        Recording is sent to the speech provider only when you choose
        transcription. Review it before sending. Audio capture and playback stop
        when you leave the screen or put the app in the background.
      </Body>
      {phase === "recording" ? (
        <Button title="Stop & transcribe" onPress={() => void transcribe()} />
      ) : (
        <Button
          title="Record a message"
          disabled={!ready || busy || phase === "speaking" || !companion}
          onPress={() => void record()}
        />
      )}
      <Field
        label="Review your transcript"
        multiline
        value={transcript}
        onChangeText={setTranscript}
        editable={!busy && phase !== "recording"}
        maxLength={2000}
      />
      <Button
        title={
          phase === "sending" ? "Preparing your reply…" : "Send & hear reply"
        }
        disabled={
          !ready ||
          busy ||
          phase === "recording" ||
          phase === "speaking" ||
          !transcript.trim()
        }
        onPress={() => void send()}
      />
      {phase !== "idle" && (
        <Button
          outline
          title={
            phase === "speaking" ? "Stop playback" : "Cancel voice activity"
          }
          onPress={() => void cancel()}
        />
      )}
      <ErrorText error={error} />
      {reply && (
        <Card>
          <Body small>{companion?.name} · AI reply</Body>
          <Body>{reply}</Body>
        </Card>
      )}
      <Button
        outline
        title="Open saved text conversation"
        onPress={() =>
          router.replace({ pathname: "/chat/[id]", params: { id } })
        }
      />
    </Screen>
  );
}
export default function Call() {
  return (
    <RequireUser>
      <VoiceConversation />
    </RequireUser>
  );
}
