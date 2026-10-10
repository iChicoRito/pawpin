const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadSource, hooks, native, findElement, ui, theme } = require('./load-source.cjs');

test('drawer and dialog backdrops follow actual open state, including dismissal', () => {
  let isOpen = false;
  const dependencies = {
    react: React,
    'react-native': native,
    'expo-blur': { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' },
    'heroui-native': {
      BottomSheet: { Overlay: 'Overlay' },
      Menu: { Overlay: 'Overlay' },
      Select: { Overlay: 'Overlay' },
      Popover: { Overlay: 'Overlay' },
      Dialog: { Overlay: 'Overlay' },
      useBottomSheet: () => ({ isOpen }),
      useMenu: () => ({ isOpen }),
      useSelect: () => ({ isOpen }),
      usePopover: () => ({ isOpen }),
      useDialog: () => ({ isOpen }),
    },
  };
  const exports = loadSource('src/components/drawer-backdrop.tsx', dependencies);
  for (const name of ['DrawerBottomSheetOverlay', 'DrawerMenuOverlay', 'DrawerSelectOverlay', 'DrawerPopoverOverlay', 'AppDialogOverlay']) {
    isOpen = false;
    assert.equal(findElement(exports[name](), (node) => node.type === exports.PageVeil), undefined);
    isOpen = true;
    assert.ok(findElement(exports[name](), (node) => node.type === exports.PageVeil));
    isOpen = false;
    assert.equal(findElement(exports[name](), (node) => node.type === exports.PageVeil), undefined);
    assert.ok(findElement(exports[name](), (node) => node.type === 'Overlay'));
  }
});

function sheetParts() {
  return Object.assign(function BottomSheet() {}, {
    Trigger: 'SheetTrigger', Portal: 'SheetPortal', Content: 'SheetContent', Title: 'SheetTitle',
  });
}

// Exercise the installed HeroUI hook: its swipe handler can retain the setter from before opening.
function drawerState(readProps) {
  const state = hooks();
  let effects = [];
  const { useControllableState } = loadSource(
    'node_modules/heroui-native/src/helpers/internal/hooks/use-controllable-state.ts',
    { react: {
      ...state.react,
      useCallback: (callback) => callback,
      useMemo: (factory) => factory(),
      useEffect: (effect) => effects.push(effect),
      useLayoutEffect: (effect) => effects.push(effect),
    } }
  );
  return () => {
    effects = [];
    const props = readProps();
    const result = state.render(() => useControllableState({
      prop: props.isOpen, defaultProp: props.isDefaultOpen ?? false, onChange: props.onOpenChange,
    }));
    effects.forEach((effect) => effect());
    return result;
  };
}

test('list filter can reopen after swipe callback captured while closed', () => {
  const state = hooks();
  const searched = [];
  const BottomSheet = sheetParts();
  let sheetContext;
  const { ListFilter, __test } = loadSource('src/components/list-filter.tsx', {
    react: state.react, 'react-native': native,
    'heroui-native': { ...ui, BottomSheet, Button: 'Button', Slider: ui.Slider, Tabs: ui.Tabs,
      useThemeColor: () => '#000', useBottomSheet: () => sheetContext },
    '@hugeicons/core-free-icons/FilterHorizontalIcon': {}, '@hugeicons/react-native': { HugeiconsIcon: 'Icon' },
    uniwind: { useResolveClassNames: () => ({ color: '#000' }) },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/drawer-backdrop': { DrawerBottomSheetOverlay: 'Backdrop' },
    '@/constants/theme': theme,
    '@/hooks/use-nearby-reports': { useNearbyReports: () => ({ radiusM: 5000, setRadius(value) { searched.push(value); } }) },
    '@/lib/nearby': { RADIUS_CHOICES: [{ value: 5000, label: '5 km' }, { value: 10000, label: '10 km' }] },
  }, ['FilterDone']);
  const render = () => state.render(ListFilter, {});
  assert.equal(findElement(render(), (node) => node.props?.['aria-label'] === 'Whose reports to show'), undefined);
  const distance = findElement(render(), (node) => node.props?.['aria-label'] === 'Search distance');
  distance.props.onChangeEnd(1);
  assert.deepEqual(searched, [10000]);
  const read = drawerState(() => findElement(render(), (node) => node.type === BottomSheet).props);
  const [, staleSwipeClose] = read();
  const trigger = findElement(render(), (node) => node.type === 'SheetTrigger');
  const open = () => {
    if (trigger) read()[1](true);
    else findElement(render(), (node) => node.type === 'Button').props.onPress();
  };
  open();
  assert.equal(read()[0], true);
  staleSwipeClose(false);
  assert.equal(read()[0], false, 'swipe must clear open state instead of leaving backdrop active');
  open();
  assert.equal(read()[0], true);
  sheetContext = { onOpenChange: read()[1] };
  __test.FilterDone().props.onPress();
  assert.equal(read()[0], false, 'Done must close the same state as swipe and overlay dismissal');
});

test('map preview can reopen after swipe callback captured while closed', () => {
  let intent = false;
  const BottomSheet = sheetParts();
  let sheetContext;
  let openEffect;
  const { ReportPreview, __test } = loadSource('src/components/report-preview.tsx', {
    'expo-image': { Image: 'Image' },
    'heroui-native': { BottomSheet, Button: 'Button', Chip: 'Chip', useBottomSheet: () => sheetContext },
    react: { ...React, useEffect: (effect) => { openEffect = effect; } }, 'react-native': native,
    '@/components/report-card': { URGENCY_CHIP: {} },
    '@/components/drawer-backdrop': { DrawerBottomSheetOverlay: 'Backdrop' },
    '@/components/themed-text': { ThemedText: 'Text' }, '@/constants/theme': theme,
    '@/hooks/use-directions': { useDirections: () => ({}) },
    '@/hooks/use-session': { useSession: () => ({ session: null }) },
    '@/lib/format': {}, '@/lib/reports': {},
  }, ['PreviewOpenState']);
  const read = drawerState(() => findElement(ReportPreview({
    isOpen: intent, report: undefined, onClose: () => { intent = false; }, onView() {},
  }), (node) => node.type === BottomSheet).props);
  const syncMapIntent = () => {
    sheetContext = { onOpenChange: read()[1] };
    __test.PreviewOpenState({ isOpen: intent });
    openEffect();
  };
  const [, staleSwipeClose] = read();
  intent = true;
  syncMapIntent();
  assert.equal(read()[0], true);
  staleSwipeClose(false);
  assert.equal(read()[0], false, 'swipe must close HeroUI state even when its callback predates opening');
  read();
  assert.equal(intent, false);
  intent = true;
  syncMapIntent();
  assert.equal(read()[0], true);
  intent = false;
  syncMapIntent();
  assert.equal(read()[0], false, 'leaving for full report must close the preview');
});
