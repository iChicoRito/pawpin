import { LinearGradient } from 'expo-linear-gradient';
import {
  Accordion,
  Alert,
  Avatar,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  Chip,
  CloseButton,
  ControlField,
  Description,
  Dialog,
  FieldError,
  GlassView,
  Input,
  InputGroup,
  InputOTP,
  Label,
  LinkButton,
  ListGroup,
  Menu,
  Popover,
  PressableFeedback,
  Radio,
  RadioGroup,
  ScrollShadow,
  SearchField,
  Select,
  Separator,
  Skeleton,
  SkeletonGroup,
  Slider,
  Spinner,
  SubMenu,
  Surface,
  Switch,
  Tabs,
  TagGroup,
  TextArea,
  TextField,
  ThemeBackground,
  Typography,
  useToast,
} from 'heroui-native';
import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppDialogOverlay,
  DrawerBottomSheetOverlay,
  DrawerMenuOverlay,
  DrawerPopoverOverlay,
  DrawerSelectOverlay,
} from '@/components/drawer-backdrop';

const SIZES = ['sm', 'md', 'lg'] as const;
const COLORS = ['accent', 'default', 'success', 'warning', 'danger'] as const;
const STATUSES = ['default', 'accent', 'success', 'warning', 'danger'] as const;
const PRIMARY_SECONDARY = ['primary', 'secondary'] as const;
const PLACEMENTS = ['top', 'bottom', 'left', 'right'] as const;
const BUTTON_VARIANTS = [
  'primary',
  'secondary',
  'tertiary',
  'outline',
  'ghost',
  'danger',
  'danger-soft',
] as const;
const CHIP_VARIANTS = ['primary', 'secondary', 'tertiary', 'soft'] as const;
const SURFACE_VARIANTS = ['default', 'secondary', 'tertiary', 'transparent'] as const;

/** One component: name heading plus its variant groups. */
function Demo({ name, children }: { name: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Typography type="h4">{name}</Typography>
      {children}
      <Separator className="mt-3" />
    </View>
  );
}

/** One variant group inside a Demo: small caption plus wrapped row of examples. */
function Group({
  label,
  column,
  children,
}: {
  label: string;
  column?: boolean;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <Typography type="body-xs" color="muted">
        {label}
      </Typography>
      <View className={column ? 'gap-2' : 'flex-row flex-wrap items-center gap-2'}>{children}</View>
    </View>
  );
}

function Buttons() {
  return (
    <>
      <Demo name="Button">
        <Group label="variant">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Group>
        <Group label="size">
          {SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
            </Button>
          ))}
        </Group>
        <Group label="feedbackVariant">
          <Button feedbackVariant="scale-highlight">scale-highlight</Button>
          <Button feedbackVariant="scale-ripple">scale-ripple</Button>
          <Button feedbackVariant="scale">scale</Button>
          <Button feedbackVariant="none">none</Button>
        </Group>
        <Group label="isIconOnly / isDisabled">
          <Button isIconOnly>+</Button>
          <Button isDisabled>Disabled</Button>
        </Group>
      </Demo>

      <Demo name="LinkButton">
        <Group label="size">
          {SIZES.map((size) => (
            <LinkButton key={size} size={size}>
              {size}
            </LinkButton>
          ))}
        </Group>
        <Group label="isDisabled">
          <LinkButton isDisabled>Disabled</LinkButton>
        </Group>
      </Demo>

      <Demo name="CloseButton">
        <Group label="default / isDisabled">
          <CloseButton />
          <CloseButton isDisabled />
        </Group>
      </Demo>

      <Demo name="PressableFeedback">
        <Group label="default / Highlight / Ripple / Scale" column>
          <PressableFeedback className="rounded-xl bg-surface p-4">
            <Typography>Default</Typography>
          </PressableFeedback>
          <PressableFeedback className="rounded-xl bg-surface p-4">
            <PressableFeedback.Highlight />
            <Typography>Highlight</Typography>
          </PressableFeedback>
          <PressableFeedback className="rounded-xl bg-surface p-4">
            <PressableFeedback.Ripple />
            <Typography>Ripple</Typography>
          </PressableFeedback>
          <PressableFeedback>
            <PressableFeedback.Scale className="rounded-xl bg-surface p-4">
              <Typography>Scale</Typography>
            </PressableFeedback.Scale>
          </PressableFeedback>
        </Group>
      </Demo>
    </>
  );
}

function Forms() {
  const [search, setSearch] = useState('');
  return (
    <>
      <Demo name="TextField / Label / Input / Description / FieldError">
        <Group label="default" column>
          <TextField>
            <Label>Email</Label>
            <Input placeholder="Enter your email" />
            <Description>We never share your email.</Description>
          </TextField>
        </Group>
        <Group label="isRequired + isInvalid" column>
          <TextField isRequired isInvalid>
            <Label>Email</Label>
            <Input placeholder="Enter your email" />
            <FieldError>This field is required</FieldError>
          </TextField>
        </Group>
        <Group label="isDisabled" column>
          <TextField isDisabled>
            <Label>Email</Label>
            <Input placeholder="Disabled" />
          </TextField>
        </Group>
      </Demo>

      <Demo name="Input">
        <Group label="variant" column>
          {PRIMARY_SECONDARY.map((variant) => (
            <Input key={variant} variant={variant} placeholder={variant} />
          ))}
        </Group>
      </Demo>

      <Demo name="TextArea">
        <Group label="variant" column>
          {PRIMARY_SECONDARY.map((variant) => (
            <TextArea key={variant} variant={variant} placeholder={variant} />
          ))}
        </Group>
      </Demo>

      <Demo name="InputGroup">
        <Group label="Prefix / Suffix / isDisabled" column>
          <InputGroup>
            <InputGroup.Prefix>
              <Typography color="muted">@</Typography>
            </InputGroup.Prefix>
            <InputGroup.Input placeholder="username" />
          </InputGroup>
          <InputGroup>
            <InputGroup.Input placeholder="amount" />
            <InputGroup.Suffix>
              <Typography color="muted">PHP</Typography>
            </InputGroup.Suffix>
          </InputGroup>
          <InputGroup isDisabled>
            <InputGroup.Prefix>
              <Typography color="muted">@</Typography>
            </InputGroup.Prefix>
            <InputGroup.Input placeholder="disabled" />
          </InputGroup>
        </Group>
      </Demo>

      <Demo name="SearchField">
        <Group label="default / isDisabled" column>
          <SearchField value={search} onChange={setSearch}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <SearchField isDisabled>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input />
            </SearchField.Group>
          </SearchField>
        </Group>
      </Demo>

      <Demo name="InputOTP">
        {PRIMARY_SECONDARY.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`}>
            <InputOTP maxLength={4}>
              <InputOTP.Group>
                <InputOTP.Slot index={0} variant={variant} />
                <InputOTP.Slot index={1} variant={variant} />
              </InputOTP.Group>
              <InputOTP.Separator />
              <InputOTP.Group>
                <InputOTP.Slot index={2} variant={variant} />
                <InputOTP.Slot index={3} variant={variant} />
              </InputOTP.Group>
            </InputOTP>
          </Group>
        ))}
        <Group label="isInvalid / isDisabled" column>
          <InputOTP maxLength={2} isInvalid>
            <InputOTP.Group>
              <InputOTP.Slot index={0} />
              <InputOTP.Slot index={1} />
            </InputOTP.Group>
          </InputOTP>
          <InputOTP maxLength={2} isDisabled>
            <InputOTP.Group>
              <InputOTP.Slot index={0} />
              <InputOTP.Slot index={1} />
            </InputOTP.Group>
          </InputOTP>
        </Group>
      </Demo>
    </>
  );
}

function Controls() {
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState(true);
  const [switched, setSwitched] = useState(true);
  const [control, setControl] = useState(true);
  const [choice, setChoice] = useState('1');
  return (
    <>
      <Demo name="Checkbox">
        <Group label="variant: primary / secondary">
          {PRIMARY_SECONDARY.map((variant) => (
            <Checkbox
              key={variant}
              variant={variant}
              isSelected={checked}
              onSelectedChange={setChecked}
            />
          ))}
        </Group>
        <Group label="isInvalid / isDisabled">
          <Checkbox isInvalid isSelected={checked} onSelectedChange={setChecked} />
          <Checkbox isDisabled isSelected />
        </Group>
      </Demo>

      <Demo name="Radio">
        <Group label="default / isInvalid / isDisabled">
          <Radio isSelected={radio} onSelectedChange={setRadio} />
          <Radio isInvalid isSelected={radio} onSelectedChange={setRadio} />
          <Radio isDisabled isSelected />
        </Group>
      </Demo>

      <Demo name="RadioGroup">
        {PRIMARY_SECONDARY.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <RadioGroup variant={variant} value={choice} onValueChange={setChoice}>
              <RadioGroup.Item value="1">Option 1</RadioGroup.Item>
              <RadioGroup.Item value="2">Option 2</RadioGroup.Item>
            </RadioGroup>
          </Group>
        ))}
        <Group label="isInvalid / isDisabled" column>
          <RadioGroup isInvalid value={choice} onValueChange={setChoice}>
            <RadioGroup.Item value="1">Invalid</RadioGroup.Item>
            <FieldError>Pick one</FieldError>
          </RadioGroup>
          <RadioGroup isDisabled value="1" onValueChange={setChoice}>
            <RadioGroup.Item value="1">Disabled</RadioGroup.Item>
          </RadioGroup>
        </Group>
      </Demo>

      <Demo name="Switch">
        <Group label="default / isDisabled">
          <Switch isSelected={switched} onSelectedChange={setSwitched} />
          <Switch isDisabled isSelected />
        </Group>
      </Demo>

      <Demo name="ControlField">
        <Group label="variant: switch / checkbox / radio" column>
          {(['switch', 'checkbox', 'radio'] as const).map((variant) => (
            <ControlField key={variant} isSelected={control} onSelectedChange={setControl}>
              <Label className="flex-1">{variant}</Label>
              <ControlField.Indicator variant={variant} />
            </ControlField>
          ))}
        </Group>
        <Group label="isInvalid / isDisabled" column>
          <ControlField isInvalid isSelected={control} onSelectedChange={setControl}>
            <Label className="flex-1">Invalid</Label>
            <ControlField.Indicator />
          </ControlField>
          <ControlField isDisabled isSelected>
            <Label className="flex-1">Disabled</Label>
            <ControlField.Indicator />
          </ControlField>
        </Group>
      </Demo>

      <Demo name="Slider">
        <Group label="single" column>
          <Slider defaultValue={30}>
            <Slider.Output />
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </Group>
        <Group label="range" column>
          <Slider defaultValue={[20, 80]}>
            <Slider.Output />
            <Slider.Track>
              {({ state }) => (
                <>
                  <Slider.Fill />
                  {state.values.map((_, i) => (
                    <Slider.Thumb key={i} index={i} />
                  ))}
                </>
              )}
            </Slider.Track>
          </Slider>
        </Group>
        <Group label="orientation: vertical">
          <View className="h-40">
            <Slider defaultValue={50} orientation="vertical">
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </View>
        </Group>
        <Group label="isDisabled" column>
          <Slider defaultValue={50} isDisabled>
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </Group>
      </Demo>

      <Demo name="Select">
        {(['popover', 'bottom-sheet', 'dialog'] as const).map((presentation) => (
          <Group key={presentation} label={`presentation: ${presentation}`} column>
            <Select presentation={presentation}>
              <Select.Trigger>
                <Select.Value placeholder="Choose an option" />
                <Select.TriggerIndicator />
              </Select.Trigger>
              <Select.Portal>
                {presentation === 'popover' ? <Select.Overlay /> : <DrawerSelectOverlay />}
                <Select.Content presentation={presentation}>
                  <Select.Item value="1" label="Option 1" />
                  <Select.Item value="2" label="Option 2" />
                </Select.Content>
              </Select.Portal>
            </Select>
          </Group>
        ))}
        <Group label="Trigger variant: unstyled / isDisabled" column>
          <Select>
            <Select.Trigger variant="unstyled">
              <Select.Value placeholder="Unstyled trigger" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="popover">
                <Select.Item value="1" label="Option 1" />
              </Select.Content>
            </Select.Portal>
          </Select>
          <Select isDisabled>
            <Select.Trigger>
              <Select.Value placeholder="Disabled" />
              <Select.TriggerIndicator />
            </Select.Trigger>
          </Select>
        </Group>
      </Demo>

      <Demo name="TagGroup">
        {(['default', 'surface'] as const).map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <TagGroup variant={variant} selectionMode="multiple">
              <TagGroup.List>
                <TagGroup.Item id="dog">Dog</TagGroup.Item>
                <TagGroup.Item id="cat">Cat</TagGroup.Item>
                <TagGroup.Item id="other">Other</TagGroup.Item>
              </TagGroup.List>
            </TagGroup>
          </Group>
        ))}
        {SIZES.map((size) => (
          <Group key={size} label={`size: ${size}`} column>
            <TagGroup size={size} selectionMode="single">
              <TagGroup.List>
                <TagGroup.Item id="a">Small</TagGroup.Item>
                <TagGroup.Item id="b">Large</TagGroup.Item>
              </TagGroup.List>
            </TagGroup>
          </Group>
        ))}
        <Group label="isDisabled" column>
          <TagGroup isDisabled>
            <TagGroup.List>
              <TagGroup.Item id="a">Disabled</TagGroup.Item>
            </TagGroup.List>
          </TagGroup>
        </Group>
      </Demo>
    </>
  );
}

function DataDisplay() {
  return (
    <>
      <Demo name="Typography">
        <Group label="type" column>
          {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'body-sm', 'body-xs', 'code'] as const).map(
            (type) => (
              <Typography key={type} type={type}>
                {type}
              </Typography>
            )
          )}
        </Group>
        <Group label="weight">
          {(['normal', 'medium', 'semibold', 'bold'] as const).map((weight) => (
            <Typography key={weight} weight={weight}>
              {weight}
            </Typography>
          ))}
        </Group>
        <Group label="color">
          <Typography color="default">default</Typography>
          <Typography color="muted">muted</Typography>
        </Group>
        <Group label="align" column>
          {(['start', 'center', 'end', 'justify'] as const).map((align) => (
            <Typography key={align} align={align}>
              {align}
            </Typography>
          ))}
        </Group>
      </Demo>

      <Demo name="Chip">
        {CHIP_VARIANTS.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`}>
            {COLORS.map((color) => (
              <Chip key={color} variant={variant} color={color}>
                {color}
              </Chip>
            ))}
          </Group>
        ))}
        <Group label="size">
          {SIZES.map((size) => (
            <Chip key={size} size={size}>
              {size}
            </Chip>
          ))}
        </Group>
      </Demo>

      <Demo name="Avatar">
        {(['default', 'soft'] as const).map((variant) => (
          <Group key={variant} label={`variant: ${variant}`}>
            {COLORS.map((color) => (
              <Avatar key={color} alt={color} variant={variant} color={color}>
                <Avatar.Fallback>{color.slice(0, 2).toUpperCase()}</Avatar.Fallback>
              </Avatar>
            ))}
          </Group>
        ))}
        <Group label="size">
          {SIZES.map((size) => (
            <Avatar key={size} alt={size} size={size}>
              <Avatar.Fallback>{size.toUpperCase()}</Avatar.Fallback>
            </Avatar>
          ))}
        </Group>
        <Group label="Image">
          <Avatar alt="Expo icon">
            <Avatar.Image source={require('@/assets/images/icon.png')} />
            <Avatar.Fallback>EX</Avatar.Fallback>
          </Avatar>
        </Group>
      </Demo>

      <Demo name="Card">
        {SURFACE_VARIANTS.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <Card variant={variant}>
              <Card.Header>
                <Chip size="sm">Header</Chip>
              </Card.Header>
              <Card.Body>
                <Card.Title>Card title</Card.Title>
                <Card.Description>Card description.</Card.Description>
              </Card.Body>
              <Card.Footer>
                <Button size="sm">Footer action</Button>
              </Card.Footer>
            </Card>
          </Group>
        ))}
      </Demo>

      <Demo name="Surface">
        {SURFACE_VARIANTS.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <Surface variant={variant}>
              <Typography>Surface content</Typography>
            </Surface>
          </Group>
        ))}
      </Demo>

      <Demo name="ListGroup">
        {SURFACE_VARIANTS.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <ListGroup variant={variant}>
              <ListGroup.Item>
                <ListGroup.ItemPrefix>
                  <Avatar alt="Personal" size="sm">
                    <Avatar.Fallback>PI</Avatar.Fallback>
                  </Avatar>
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>Personal Info</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>Name, email, phone number</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </ListGroup.Item>
              <Separator className="mx-4" />
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>Notifications</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </ListGroup.Item>
            </ListGroup>
          </Group>
        ))}
      </Demo>

      <Demo name="Accordion">
        {(['default', 'surface'] as const).map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <Accordion variant={variant} selectionMode="single">
              {['1', '2'].map((value) => (
                <Accordion.Item key={value} value={value}>
                  <Accordion.Trigger>
                    <Typography>Question {value}</Typography>
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                  <Accordion.Content>
                    <Typography color="muted">Answer {value}</Typography>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion>
          </Group>
        ))}
        <Group label="selectionMode: multiple" column>
          <Accordion selectionMode="multiple">
            {['1', '2'].map((value) => (
              <Accordion.Item key={value} value={value}>
                <Accordion.Trigger>
                  <Typography>Question {value}</Typography>
                  <Accordion.Indicator />
                </Accordion.Trigger>
                <Accordion.Content>
                  <Typography color="muted">Answer {value}</Typography>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion>
        </Group>
      </Demo>

      <Demo name="Separator">
        <Group label="variant: thin / thick" column>
          <Separator variant="thin" />
          <Separator variant="thick" />
        </Group>
        <Group label="orientation: vertical">
          <View className="h-6 flex-row items-center gap-3">
            <Typography>Left</Typography>
            <Separator orientation="vertical" />
            <Typography>Right</Typography>
          </View>
        </Group>
      </Demo>
    </>
  );
}

function Feedback() {
  const { toast } = useToast();
  return (
    <>
      <Demo name="Alert">
        <Group label="status" column>
          {STATUSES.map((status) => (
            <Alert key={status} status={status}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{status}</Alert.Title>
                <Alert.Description>Alert description.</Alert.Description>
              </Alert.Content>
            </Alert>
          ))}
        </Group>
      </Demo>

      <Demo name="Toast">
        <Group label="variant">
          {STATUSES.map((variant) => (
            <Button
              key={variant}
              size="sm"
              variant="secondary"
              onPress={() => toast.show({ variant, label: variant, description: 'Toast description' })}>
              {variant}
            </Button>
          ))}
        </Group>
        <Group label="placement">
          {(['top', 'bottom'] as const).map((placement) => (
            <Button
              key={placement}
              size="sm"
              variant="secondary"
              onPress={() => toast.show({ placement, label: `Placement ${placement}` })}>
              {placement}
            </Button>
          ))}
        </Group>
        <Group label="action">
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              toast.show({
                label: 'With action',
                actionLabel: 'Close',
                onActionPress: ({ hide }) => hide(),
              })
            }>
            With action
          </Button>
        </Group>
      </Demo>

      <Demo name="Spinner">
        <Group label="size">
          {SIZES.map((size) => (
            <Spinner key={size} size={size} />
          ))}
        </Group>
        <Group label="color">
          {(['default', 'success', 'warning', 'danger'] as const).map((color) => (
            <Spinner key={color} color={color} />
          ))}
        </Group>
      </Demo>

      <Demo name="Skeleton">
        {(['shimmer', 'pulse', 'none'] as const).map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <Skeleton variant={variant} className="h-10 w-full rounded-lg" />
          </Group>
        ))}
      </Demo>

      <Demo name="SkeletonGroup">
        <Group label="isLoading" column>
          <SkeletonGroup isLoading>
            <SkeletonGroup.Item className="h-4 w-full rounded-md" />
            <SkeletonGroup.Item className="h-4 w-3/4 rounded-md" />
            <SkeletonGroup.Item className="h-4 w-1/2 rounded-md" />
          </SkeletonGroup>
        </Group>
      </Demo>
    </>
  );
}

function Overlays() {
  const [theme, setTheme] = useState<React.ComponentProps<typeof Menu.Group>['selectedKeys']>(
    new Set(['light'])
  );
  return (
    <>
      <Demo name="Dialog">
        <Group label="Report-style backdrop">
          <Dialog>
            <Dialog.Trigger asChild>
              <Button variant="secondary">Blur and dim</Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <AppDialogOverlay />
              <Dialog.Content>
                <Dialog.Close />
                <Dialog.Title>Dialog</Dialog.Title>
                <Dialog.Description>Shared blur and dim backdrop.</Dialog.Description>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>
        </Group>
      </Demo>

      <Demo name="BottomSheet">
        <Group label="Report-style backdrop">
          <BottomSheet>
            <BottomSheet.Trigger asChild>
              <Button variant="secondary">Blur and dim</Button>
            </BottomSheet.Trigger>
            <BottomSheet.Portal>
              <DrawerBottomSheetOverlay />
              <BottomSheet.Content>
                <BottomSheet.Close />
                <BottomSheet.Title>Bottom sheet</BottomSheet.Title>
                <BottomSheet.Description>Shared blur and dim backdrop.</BottomSheet.Description>
              </BottomSheet.Content>
            </BottomSheet.Portal>
          </BottomSheet>
        </Group>
      </Demo>

      <Demo name="Popover">
        <Group label="placement">
          {PLACEMENTS.map((placement) => (
            <Popover key={placement}>
              <Popover.Trigger asChild>
                <Button variant="secondary">{placement}</Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Overlay />
                <Popover.Content presentation="popover" placement={placement}>
                  <Popover.Arrow />
                  <Popover.Title>Popover</Popover.Title>
                  <Popover.Description>Placement: {placement}</Popover.Description>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
          ))}
        </Group>
        <Group label="presentation: bottom-sheet">
          <Popover>
            <Popover.Trigger asChild>
              <Button variant="secondary">bottom-sheet</Button>
            </Popover.Trigger>
            <Popover.Portal>
              <DrawerPopoverOverlay />
              <Popover.Content presentation="bottom-sheet">
                <Popover.Close />
                <Popover.Title>Popover</Popover.Title>
                <Popover.Description>Presented as bottom sheet.</Popover.Description>
              </Popover.Content>
            </Popover.Portal>
          </Popover>
        </Group>
      </Demo>

      <Demo name="Menu / SubMenu">
        <Group label="presentation">
          {(['popover', 'bottom-sheet'] as const).map((presentation) => (
            <Menu key={presentation}>
              <Menu.Trigger asChild>
                <Button variant="secondary">{presentation}</Button>
              </Menu.Trigger>
              <Menu.Portal>
                {presentation === 'bottom-sheet' ? <DrawerMenuOverlay /> : <Menu.Overlay />}
                <Menu.Content presentation={presentation}>
                  <Menu.Label>Actions</Menu.Label>
                  <Menu.Item>
                    <Menu.ItemTitle>View Profile</Menu.ItemTitle>
                    <Menu.ItemDescription>Item description</Menu.ItemDescription>
                  </Menu.Item>
                  <Menu.Item variant="danger">
                    <Menu.ItemTitle>Delete (variant: danger)</Menu.ItemTitle>
                  </Menu.Item>
                  <Menu.Item isDisabled>
                    <Menu.ItemTitle>Disabled</Menu.ItemTitle>
                  </Menu.Item>
                  <SubMenu>
                    <SubMenu.Trigger textValue="More">
                      <Menu.ItemTitle>More (SubMenu)</Menu.ItemTitle>
                      <SubMenu.TriggerIndicator />
                    </SubMenu.Trigger>
                    <SubMenu.Content>
                      <Menu.Item>
                        <Menu.ItemTitle>Settings</Menu.ItemTitle>
                      </Menu.Item>
                    </SubMenu.Content>
                  </SubMenu>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          ))}
        </Group>
        <Group label="ItemIndicator variant">
          {(['checkmark', 'dot'] as const).map((variant) => (
            <Menu key={variant}>
              <Menu.Trigger asChild>
                <Button variant="secondary">{variant}</Button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" width={200}>
                  <Menu.Group selectionMode="single" selectedKeys={theme} onSelectionChange={setTheme}>
                    {['light', 'dark', 'system'].map((id) => (
                      <Menu.Item key={id} id={id}>
                        <Menu.ItemIndicator variant={variant} />
                        <Menu.ItemTitle>{id}</Menu.ItemTitle>
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          ))}
        </Group>
        <Group label="placement">
          {PLACEMENTS.map((placement) => (
            <Menu key={placement}>
              <Menu.Trigger asChild>
                <Button variant="secondary">{placement}</Button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" placement={placement} width={160}>
                  <Menu.Item>
                    <Menu.ItemTitle>{placement}</Menu.ItemTitle>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          ))}
        </Group>
      </Demo>
    </>
  );
}

function Layout() {
  const [tab, setTab] = useState('tab1');
  return (
    <>
      <Demo name="Tabs">
        {PRIMARY_SECONDARY.map((variant) => (
          <Group key={variant} label={`variant: ${variant}`} column>
            <Tabs variant={variant} value={tab} onValueChange={setTab}>
              <Tabs.List>
                <Tabs.Indicator />
                <Tabs.Trigger value="tab1">
                  <Tabs.Label>Tab 1</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="tab2">
                  <Tabs.Label>Tab 2</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="tab3" isDisabled>
                  <Tabs.Label>Disabled</Tabs.Label>
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="tab1">
                <Typography>Content 1</Typography>
              </Tabs.Content>
              <Tabs.Content value="tab2">
                <Typography>Content 2</Typography>
              </Tabs.Content>
            </Tabs>
          </Group>
        ))}
      </Demo>

      <Demo name="ScrollShadow">
        <Group label="orientation: vertical" column>
          <ScrollShadow LinearGradientComponent={LinearGradient} className="h-24">
            <ScrollView nestedScrollEnabled>
              {Array.from({ length: 10 }, (_, i) => (
                <Typography key={i}>Row {i + 1}</Typography>
              ))}
            </ScrollView>
          </ScrollShadow>
        </Group>
        <Group label="orientation: horizontal" column>
          <ScrollShadow LinearGradientComponent={LinearGradient} orientation="horizontal">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {Array.from({ length: 12 }, (_, i) => (
                <Chip key={i}>Item {i + 1}</Chip>
              ))}
            </ScrollView>
          </ScrollShadow>
        </Group>
      </Demo>

      <Demo name="GlassView">
        <Group label="default" column>
          <View className="relative overflow-hidden rounded-3xl p-4">
            <GlassView />
            <Typography>Content above the glass</Typography>
          </View>
        </Group>
      </Demo>

      <Demo name="ThemeBackground">
        <Group label="fallbackColor: overlay / surface / field" column>
          {(['overlay', 'surface', 'field'] as const).map((fallbackColor) => (
            <View key={fallbackColor} className="relative overflow-hidden rounded-3xl p-4">
              <ThemeBackground fallbackColor={fallbackColor} />
              <Typography>{fallbackColor}</Typography>
            </View>
          ))}
        </Group>
      </Demo>
    </>
  );
}

const CATEGORIES = {
  Buttons,
  Forms,
  Controls,
  'Data Display': DataDisplay,
  Feedback,
  Overlays,
  Layout,
};
type Category = keyof typeof CATEGORIES;

export function HeroShowcase({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<Category>('Buttons');
  const Content = CATEGORIES[category];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-4 py-2">
        <Button size="sm" variant="tertiary" onPress={onBack}>
          Back
        </Button>
        <Typography type="h3">Components</Typography>
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 py-2">
          {(Object.keys(CATEGORIES) as Category[]).map((name) => (
            <Button
              key={name}
              size="sm"
              variant={name === category ? 'primary' : 'tertiary'}
              onPress={() => setCategory(name)}>
              {name}
            </Button>
          ))}
        </ScrollView>
      </View>

      {/* key remounts the list so each category starts scrolled to top */}
      <ScrollView key={category} contentContainerClassName="gap-6 p-4 pb-32">
        <Content />
      </ScrollView>
    </SafeAreaView>
  );
}
