import { BlurTargetView, BlurView } from 'expo-blur';
import {
  BottomSheet, Dialog, Menu, Popover, Select,
  useBottomSheet, useDialog, useMenu, usePopover, useSelect,
} from 'heroui-native';
import { createContext, useContext, useRef, type PropsWithChildren, type RefObject } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

const BlurTarget = createContext<RefObject<View | null> | undefined>(undefined);

export function DrawerBackdropProvider({ children }: PropsWithChildren) {
  const page = useRef<View | null>(null);
  return <BlurTarget.Provider value={page}>{children}</BlurTarget.Provider>;
}

// Keep the portal host outside the target so drawers never blur themselves.
export function DrawerBlurTarget({ children }: PropsWithChildren) {
  const page = useContext(BlurTarget);
  return (
    <BlurTargetView ref={page} style={styles.page}>
      {children}
    </BlurTargetView>
  );
}

export function PageVeil({ page, isDark }: {
  page?: RefObject<View | null>;
  isDark?: boolean;
}) {
  const target = useContext(BlurTarget);
  const scheme = useColorScheme();
  return (
    <>
      <BlurView
        blurTarget={page ?? target}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={14}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          (isDark ?? scheme === 'dark') ? styles.dimOnDark : styles.dimOnLight,
        ]}
      />
    </>
  );
}

export function DrawerBottomSheetOverlay() {
  const { isOpen } = useBottomSheet();
  return <>{isOpen && <PageVeil />}<BottomSheet.Overlay /></>;
}

export function DrawerMenuOverlay() {
  const { isOpen } = useMenu();
  return <>{isOpen && <PageVeil />}<Menu.Overlay /></>;
}

export function DrawerSelectOverlay() {
  const { isOpen } = useSelect();
  return <>{isOpen && <PageVeil />}<Select.Overlay /></>;
}

export function DrawerPopoverOverlay() {
  const { isOpen } = usePopover();
  return <>{isOpen && <PageVeil />}<Popover.Overlay /></>;
}

export function AppDialogOverlay(props: Parameters<typeof PageVeil>[0] = {}) {
  const { isOpen } = useDialog();
  return <>{isOpen && <PageVeil {...props} />}<Dialog.Overlay variant="default" /></>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  dimOnLight: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  dimOnDark: { backgroundColor: 'rgba(0, 0, 0, 0.7)' },
});
