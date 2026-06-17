import {
  Platform,
  ScrollView,
  type ScrollViewProps,
} from "react-native";

let KeyboardAwareScrollView: any;

try {
  const mod = require("react-native-keyboard-controller");
  KeyboardAwareScrollView = mod.KeyboardAwareScrollView;
} catch (e) {
  // Fallback: use ScrollView if module not available
  KeyboardAwareScrollView = ScrollView;
}

type Props = any & ScrollViewProps;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  if (Platform.OS === "web") {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
