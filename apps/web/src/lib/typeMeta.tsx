import {
  Link2,
  Image as ImageIcon,
  FileText,
  StickyNote,
  Bell,
  Clapperboard,
  Tv,
  Wrench,
  Bookmark,
  Palette,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";
import type { ItemType } from "../types";

export const TYPE_META: Record<ItemType, { label: string; icon: LucideIcon }> = {
  link: { label: "Ссылка", icon: Link2 },
  text: { label: "Текст", icon: FileText },
  image: { label: "Изображение", icon: ImageIcon },
  file: { label: "Файл", icon: FileIcon },
  note: { label: "Заметка", icon: StickyNote },
  reminder: { label: "Напоминание", icon: Bell },
  movie: { label: "Фильм", icon: Clapperboard },
  series: { label: "Сериал", icon: Tv },
  service: { label: "Сервис", icon: Wrench },
  bookmark: { label: "Закладка", icon: Bookmark },
  design_reference: { label: "Референс", icon: Palette },
};

export function typeMeta(type: ItemType) {
  return TYPE_META[type] ?? { label: type, icon: FileText };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
