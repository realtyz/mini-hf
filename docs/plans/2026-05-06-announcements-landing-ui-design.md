# Multi-Announcement + LandingPage UI Enhancement

Date: 2026-05-06

## Overview

1. Replace single-announcement key-value config with a proper `announcements` database table and CRUD API under new `/api/v1/system` endpoint.
2. Enhance LandingPage visual design: announcements UI, Hero section with decorative elements, refined typography and spacing.

## Backend: Announcement System

### Database

New `announcements` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `title` | varchar(255) | Optional, nullable |
| `content` | text | Required |
| `announcement_type` | enum(`info`, `warning`, `urgent`) | Default `info` |
| `is_pinned` | bool | Pinned first in ordering, default false |
| `is_active` | bool | Default true |
| `created_at` | timestamp | Auto |
| `updated_at` | timestamp | Auto |

### API — New `/api/v1/system` Router

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/system/announcements` | Public | Active announcements, pinned first |
| `GET` | `/system/announcements/{id}` | Public | Single announcement detail |
| `POST` | `/system/announcements` | Admin | Create |
| `PUT` | `/system/announcements/{id}` | Admin | Update |
| `DELETE` | `/system/announcements/{id}` | Admin | Delete |

### Migration

- Old `/health/announcement` endpoint: kept for backward compat, queries first active announcement from new table.
- Old key-value config (`system_announcement`, `system_announcement_type`, `system_announcement_active`): deprecated, no longer read.

## Frontend: Announcements UI

- Multiple announcements stacked as compact banners below Header
- Pinned items show pin icon, always at top
- Each type (`info`/`warning`/`urgent`) has distinct left border accent color
- Each individually dismissible; dismissed IDs stored in localStorage
- If 3+ active announcements: show first 2 + "Show all (N)" toggle

## Frontend: LandingPage Visual Enhancement

**Style**: Modern Minimal + Subtle Tech
- Clean typography, generous whitespace
- Subtle decorative elements: gradient glows, faint grid pattern background, glassmorphism cards
- Tool-oriented (not marketing), avoids excessive decoration

### Hero Section
- Background: subtle gradient mesh + faint dot grid
- Larger heading with brand gradient text
- Stats badges (cached models count, datasets count)
- CTA button instead of text link

### Trending Section (existing, minor polish)
- Section divider with decorative element
- Cards already have hover elevation (keep)

### Global
- Unified section spacing (`py-16 md:py-20`)
- Footer: add brand logo
