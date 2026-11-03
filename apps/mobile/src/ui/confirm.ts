import { Alert } from 'react-native'

/** Native confirmation dialog as a promise. Resolves true only when the user confirms. */
export const confirm = (title: string, message?: string, confirmLabel = 'Delete') =>
  new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  })
