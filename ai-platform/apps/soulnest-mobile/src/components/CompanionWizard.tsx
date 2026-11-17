import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "../lib/api";
import {
  type Companion,
  type Profile,
  type Language,
  languages,
  relationships,
  profileFrom,
  validateProfile,
} from "../lib/domain";
import { choosePhoto, discardPhoto, type SelectedPhoto } from "../lib/photos";
import {
  Button,
  Body,
  Card,
  Check,
  Choices,
  ErrorText,
  Field,
  Screen,
  Title,
  ui,
  useTask,
} from "./ui";
export function CompanionWizard({ existing }: { existing?: Companion }) {
  const [profile, setProfile] = useState<Profile>(() => profileFrom(existing)),
    [step, setStep] = useState(0),
    [photo, setPhoto] = useState<SelectedPhoto | null>(null),
    [authorized, setAuthorized] = useState(false);
  const created = useRef(existing?.id),
    photoRef = useRef<SelectedPhoto | null>(null);
  const task = useTask();
  useEffect(() => () => discardPhoto(photoRef.current), []);
  function change(key: keyof Profile, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
  }
  async function save() {
    const input = validateProfile(profile);
    if (photo && !authorized)
      throw Error("Confirm permission before uploading the photo.");
    let id = created.current;
    if (!id) {
      const data = await api<{ companion: Companion }>(
        "companions",
        "POST",
        input,
      );
      id = data.companion.id;
      created.current = id;
    } else await api(`companions/${id}`, "PUT", input);
    if (photo)
      await api(`companions/${id}/photo`, "PUT", {
        base64: photo.base64,
        authorized,
      });
    discardPhoto(photo);
    photoRef.current = null;
    router.replace({ pathname: "/chat/[id]", params: { id } });
  }
  return (
    <Screen>
      <Title eyebrow={`YOUR COMPANION · ${step + 1} OF 4`}>
        {
          [
            "A familiar kind of company.",
            "A voice that feels right.",
            "A little more personal.",
            "Make it your own.",
          ][step]
        }
      </Title>
      <View style={ui.row}>
        {[0, 1, 2, 3].map((n) => (
          <View
            key={n}
            style={{
              height: 4,
              flex: 1,
              backgroundColor: n <= step ? "#315B47" : "#D9DFD2",
              borderRadius: 2,
            }}
          />
        ))}
      </View>
      {step === 0 && (
        <>
          <Field
            label="Name or nickname"
            value={profile.name}
            maxLength={60}
            onChangeText={(value) => change("name", value)}
            placeholder="A name you like"
          />
          <Choices
            label="Relationship style"
            items={relationships}
            value={profile.relationship}
            onChange={(value) => change("relationship", value)}
          />
          {profile.relationship === "custom" && (
            <Field
              label="Custom relationship label"
              value={profile.custom_label}
              onChangeText={(value) => change("custom_label", value)}
              maxLength={60}
            />
          )}
          <Card>
            <Body small>
              These are fictional AI styles. Family, mentor and custom roles
              stay platonic. Romantic styles are affectionate and non-explicit,
              for adults only.
            </Body>
          </Card>
        </>
      )}
      {step === 1 && (
        <>
          <Choices
            label="Personality"
            items={["gentle", "playful", "thoughtful", "motivating"].map(
              (v) => [v, v] as const,
            )}
            value={profile.personality}
            onChange={(value) => change("personality", value)}
          />
          <Choices
            label="Speaking style"
            items={["warm", "calm", "cheerful", "direct"].map(
              (v) => [v, v] as const,
            )}
            value={profile.tone}
            onChange={(value) => change("tone", value)}
          />
          <Choices
            label="Preferred language"
            items={languages}
            value={profile.language}
            onChange={(value) => change("language", value as Language)}
          />
        </>
      )}
      {step === 2 && (
        <>
          <Field
            label="How should your companion talk with you?"
            value={profile.instructions}
            onChangeText={(value) => change("instructions", value)}
            multiline
            maxLength={1000}
            placeholder="Listen first, use short replies…"
          />
          <Field
            label="Interests & preferences"
            value={profile.interests}
            onChangeText={(value) => change("interests", value)}
            maxLength={400}
            placeholder="Music, cricket, quiet mornings…"
          />
          <Field
            label="Favourite phrases"
            value={profile.phrases}
            onChangeText={(value) => change("phrases", value)}
            maxLength={300}
          />
          <Body small>
            Customization cannot override AI identity, autonomy or safety
            boundaries.
          </Body>
        </>
      )}
      {step === 3 && (
        <>
          <Card>
            <Text style={ui.h2}>{profile.name || "Your companion"}</Text>
            <Body>
              {relationships.find(([key]) => key === profile.relationship)?.[1]}{" "}
              · {profile.personality} · {profile.tone}
            </Body>
            <Body small>
              Always an AI simulation, never the actual person in a photo.
            </Body>
          </Card>
          {photo && (
            <Image
              source={{ uri: photo.uri }}
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                alignSelf: "center",
              }}
              accessibilityLabel="Selected private companion photo"
            />
          )}
          <Button
            outline
            title="Choose an optional authorized photo"
            disabled={task.busy}
            onPress={() =>
              void task.run(async () => {
                const next = await choosePhoto();
                if (next) {
                  discardPhoto(photoRef.current);
                  photoRef.current = next;
                  setPhoto(next);
                  setAuthorized(false);
                }
              })
            }
          />
          {photo && (
            <>
              <Check value={authorized} onChange={setAuthorized}>
                I own this photo or have permission to use this person’s
                likeness for a private AI simulation.
              </Check>
              <Button
                outline
                title="Continue without this photo"
                onPress={() => {
                  discardPhoto(photo);
                  photoRef.current = null;
                  setPhoto(null);
                  setAuthorized(false);
                }}
              />
            </>
          )}
          <Body small>
            Images are resized and uploaded privately. They are never sent to
            the chat model. Cloud photo storage must be configured on the API.
          </Body>
        </>
      )}
      <ErrorText error={task.error} />
      {created.current && !existing && task.error && (
        <Body small>
          Your companion may already be saved. Retrying updates that companion
          instead of creating a duplicate. You can skip the photo and continue.
        </Body>
      )}
      {step > 0 && (
        <Button
          title="Back"
          outline
          disabled={task.busy}
          onPress={() => setStep((s) => s - 1)}
        />
      )}
      <Button
        title={
          task.busy
            ? "Saving…"
            : step === 3
              ? existing
                ? "Save companion"
                : "Create & start chatting"
              : "Continue"
        }
        disabled={task.busy}
        onPress={() => {
          if (step < 3) {
            if (step === 0) {
              try {
                validateProfile(profile);
              } catch (e) {
                task.setError((e as Error).message);
                return;
              }
            }
            task.setError("");
            setStep((s) => s + 1);
          } else void task.run(save);
        }}
      />
    </Screen>
  );
}
