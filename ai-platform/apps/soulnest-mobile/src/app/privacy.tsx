import { Screen, Title, Body, Card } from "../components/ui";
export default function Privacy() {
  return (
    <Screen>
      <Title eyebrow="YOUR SPACE. YOUR CHOICES.">
        Care, with clear boundaries.
      </Title>
      <Card>
        <Body>
          Every companion is a fictional AI simulation, not a conscious person,
          the person in a photo, a professional adviser or emergency care.
          SoulNest supports real-world connections. Family, mentor and custom
          roles stay platonic; all conversations are non-explicit. Adults 18+
          only.
        </Body>
      </Card>
      <Body>
        Your account, companion profiles and messages are stored privately on
        the configured server. Only enabled notes you explicitly save become
        long-term memory. Messages, recent context and enabled notes go to the
        configured AI provider for replies. Audio goes to the speech provider
        only when you choose transcription or playback.
      </Body>
      <Body>
        Photos require your ownership or permission to use the person’s
        likeness. They are privately stored and are not sent to the chat model.
        Permission is an attestation, not independent identity verification. No
        voice-cloning option is offered.
      </Body>
      <Body>
        Turning memory off deletes saved notes. Clear history also removes
        copies you typed in chat. Deleting a companion removes its photo
        references, messages and notes. Account deletion removes active account
        records. Private object files are queued for deletion, normally after a
        ten-minute grace period; provider outages can delay cleanup. Backups and
        external AI providers follow their own retention policies.
      </Body>
      <Body>
        Session credentials use the phone’s secure key storage. Chat history is
        not saved for offline use. Temporary recordings and generated audio are
        removed after use. Notifications are optional, local reminders with
        generic text and no private message preview.
      </Body>
      <Body>
        No payments are active. Email verification, recovery, verified age
        assurance and live-model/device evaluations remain release work.
      </Body>
      <Body small>HPSV Infra Tech LLP · SoulNest</Body>
    </Screen>
  );
}
