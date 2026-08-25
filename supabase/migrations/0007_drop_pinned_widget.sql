-- Pinned "recent saves" widget removed — didn't land, not worth the extra
-- state on profiles.
alter table profiles drop column if exists pinned_message_id;
