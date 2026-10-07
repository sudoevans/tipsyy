import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Compass,
  Crosshair,
  CircleHelp,
  Heart,
  LockKeyhole,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StoreIconName = "arrow" | "arrow-left" | "arrow-right" | "bag" | "bell" | "check" | "close" | "compass" | "current-location" | "heart" | "help" | "location" | "lock" | "minus" | "pencil" | "plus" | "search" | "settings" | "trash" | "user";

interface StoreIconProps {
  className?: string;
  name: StoreIconName;
}

const icons: Record<StoreIconName, LucideIcon> = {
  arrow: ChevronDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  bag: ShoppingBag,
  bell: Bell,
  check: Check,
  close: X,
  compass: Compass,
  "current-location": Crosshair,
  heart: Heart,
  help: CircleHelp,
  location: MapPin,
  lock: LockKeyhole,
  minus: Minus,
  pencil: Pencil,
  plus: Plus,
  search: Search,
  settings: Settings,
  trash: Trash2,
  user: UserRound,
};

export default function StoreIcon({ className = "", name }: StoreIconProps) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
