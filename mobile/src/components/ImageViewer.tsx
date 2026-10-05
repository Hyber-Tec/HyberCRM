import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * A picture on its own, over everything, on black: pinch to zoom (iPhone), tap it or the close button to go back.
 * Shown when a post's image is tapped.
 */
export function ImageViewer({ image, onClose }: { image: { uri: string; alt: string } | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={!!image} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent supportedOrientations={["portrait"]} onRequestClose={onClose}>
      <View style={styles.backdrop} testID="image-viewer">
        {image ? (
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={styles.center}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close image" accessibilityHint={Platform.OS === "ios" ? "Pinch to zoom" : undefined}>
              <Image source={{ uri: image.uri }} style={{ width, height }} contentFit="contain" accessibilityLabel={image.alt || "Image"} />
            </Pressable>
          </ScrollView>
        ) : null}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          testID="image-viewer-close"
          style={({ pressed }) => [styles.close, { top: insets.top + 8, opacity: pressed ? 0.6 : 1 }]}
        >
          <X size={20} color="#ffffff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000" },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  close: { position: "absolute", left: 16, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff2e" },
});
