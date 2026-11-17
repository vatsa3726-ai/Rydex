import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
export type SelectedPhoto = { uri: string; base64: string };
export async function choosePhoto(): Promise<SelectedPhoto | null> {
  const selected = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (selected.canceled) return null;
  try {
    const context = ImageManipulator.manipulate(selected.assets[0].uri);
    context.resize({ width: 512, height: 512 });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.8,
      base64: true,
    });
    if (!saved.base64) throw Error("The photo could not be prepared.");
    if (saved.base64.length > 2800000) throw Error("Choose a smaller photo.");
    return { uri: saved.uri, base64: saved.base64 };
  } finally {
    const uri = selected.assets[0].uri;
    if (uri.startsWith(Paths.cache.uri)) {
      try {
        const copy = new File(uri);
        if (copy.exists) copy.delete();
      } catch {}
    }
  }
}
export function discardPhoto(photo: SelectedPhoto | null) {
  if (!photo) return;
  try {
    const file = new File(photo.uri);
    if (file.exists) file.delete();
  } catch {}
}
