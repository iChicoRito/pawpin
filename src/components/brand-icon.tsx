import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

/**
 * Another app's own logo, on a white tile like an app icon. The tile stays white in dark mode:
 * brand colors are drawn for a white ground. Decorative; the text beside it names the app.
 *
 * Pass the `svg` string of one icon: `import { svg } from 'thesvg/google-maps'`. Import one file
 * per icon. The package's main entry loads 6,500 of them.
 */
export function BrandIcon({ xml }: { xml: string }) {
  return (
    <View aria-hidden style={styles.tile}>
      <SvgXml xml={xml} width={24} height={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
});
