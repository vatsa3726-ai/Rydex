import { useState } from "react";
import { Modal } from "react-native";
import { api } from "../lib/api";
import {
  Body,
  Button,
  Card,
  Check,
  ErrorText,
  Field,
  Screen,
  useTask,
} from "./ui";
export function ReportReply({
  companionId,
  messageId,
  onClose,
}: {
  companionId: string;
  messageId: string;
  onClose: () => void;
}) {
  const task = useTask(),
    [details, setDetails] = useState(""),
    [share, setShare] = useState(false),
    [done, setDone] = useState(false);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen>
        <Card>
          <Body>Report this AI reply</Body>
          {done ? (
            <Body>
              Your report is saved for review. This is not an emergency service.
            </Body>
          ) : (
            <>
              <Field
                label="What should be reviewed?"
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={1000}
              />
              <Check value={share} onChange={setShare}>
                Share up to 500 characters of this reply with the reviewer.
                Other conversations are not included.
              </Check>
              <Button
                title="Send report"
                disabled={task.busy || details.trim().length < 5}
                onPress={() =>
                  void task.run(async () => {
                    await api("reports", "POST", {
                      companionId,
                      messageId,
                      category: "safety",
                      details: details.trim(),
                      includeExcerpt: share,
                    });
                    setDetails("");
                    setDone(true);
                  })
                }
              />
            </>
          )}
          <ErrorText error={task.error} />
          <Button outline title="Close report" onPress={onClose} />
        </Card>
      </Screen>
    </Modal>
  );
}
