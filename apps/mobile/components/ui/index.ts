/**
 * UI component library — barrel exports.
 *
 * Usage:
 *   import { Button, toast, confirm, BottomSheet, Dialog } from '@/components/ui';
 *
 * Mount once at the root layout:
 *   import { ToastViewport, AlertDialogHost } from '@/components/ui';
 *   <Layout>
 *     <Slot />
 *     <ToastViewport />
 *     <AlertDialogHost />
 *   </Layout>
 */

// Toast
export {
  toast,
  ToastViewport,
  type ToastVariant,
  type ToastOptions,
} from './Toast';

// Alert / confirm
export {
  alert,
  confirm,
  AlertDialogHost,
  type AlertVariant,
  type ConfirmOptions,
  type AlertOptions,
} from './AlertDialog';

// Button
export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from './Button';

// BottomSheet
export { BottomSheet, type BottomSheetProps } from './BottomSheet';

// Dialog
export { Dialog, type DialogProps } from './Dialog';

// Skeleton loaders
export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  type SkeletonProps,
  type SkeletonTextProps,
  type SkeletonCardProps,
} from './Skeleton';

// Shimmer CTA button
export {
  ShimmerButton,
  type ShimmerButtonProps,
  type ShimmerVariant,
} from './ShimmerButton';

// Floating-label input
export {
  FloatingLabelInput,
  type FloatingLabelInputProps,
} from './FloatingLabelInput';

// Command palette
export {
  CommandPalette,
  type CommandPaletteProps,
  type CommandItem,
} from './CommandPalette';

// Animated stat card
export { StatCard, type StatCardProps } from './StatCard';
