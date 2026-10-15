# a11ybookclub-shelf

An accessible 3D bookshelf for the [Accessibility Book Club](https://a11ybookclub.com) Webflow site. Built first for the TechShare Pro 2026 curated reading list.

The Webflow Collection List is the page. This script reads that list and builds a three.js shelf on top of it. The canvas is `aria-hidden`; every title, author, link and bio stays in real HTML. If WebGL is missing, slow, or switched off, the list is the page.

Targets WCAG 2.2 Level AA. Patterns used: toggle buttons (`aria-pressed`), roving tabindex for the position markers, a polite live region for the current book, focus moved to the detail heading on open and returned to the Open button on close.

## Files

| File | Where it goes |
|---|---|
| `dist/head-snippet.html` | Page settings, Inside `<head>` tag. Sets Shelf or List view before first paint so the list never flashes. |
| `dist/shelf.css` | Linked from Page settings, Inside `<head>` tag |
| `dist/shelf.js` | Loaded from Page settings, Before `</body>` tag |
| `demo.html` | Standalone demo with the 11 TechShare books. Open with `?nowebgl` to see the fallback. |

## Webflow page code

Inside `<head>`, paste the contents of `dist/head-snippet.html`, then:

```html
<!-- Accessibility Book Club shelf styles, pinned to a release -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/CrystalScottCPWA/a11ybookclub-shelf@6af00656430fd462994cd71ad251ae0a48d4fc6c/dist/shelf.css">
```

Before `</body>`:

```html
<!-- Accessibility Book Club shelf, pinned to a release -->
<script type="module" src="https://cdn.jsdelivr.net/gh/CrystalScottCPWA/a11ybookclub-shelf@6af00656430fd462994cd71ad251ae0a48d4fc6c/dist/shelf.js"></script>
```

The URLs are pinned to an exact commit, so nothing on the live page changes until you update them. To ship a change: push it, copy the new commit's full SHA (or create a GitHub release such as `v1.0.1` and use that tag), and update both lines.

Current live version: v1.4.1, commit `6af00656430fd462994cd71ad251ae0a48d4fc6c`.

## CMS fields (Books collection)

| Field | Type | Used for |
|---|---|---|
| TechShare Pro 2026 | Switch | Collection List filter |
| Book Cover Image + Book Cover Image Alt Text | Image + Plain text | Cover and list image alt |
| Spine Image | Image, optional | Custom spine art, used as is |
| Spine Color | Color, optional | Overrides the color sampled from the cover's spine edge |
| Short Details List | Rich text | Details list. "Print length N pages" sets book thickness |
| Author Short Bio, Second Author Short Bio | Plain text | Author cards |

## Collection List structure

Collection List Wrapper > Collection List with custom attribute `data-book-list`. Each Collection Item gets class `book-item` and these custom attributes, bound to CMS fields:

| Attribute | CMS field |
|---|---|
| `data-title` | Book Title |
| `data-subtitle` | Subtitle |
| `data-author` | Author line (Author Full Name, plus "and" Second Author Full Name when set) |
| `data-cover` | Book Cover Image URL |
| `data-spine-image` | Spine Image URL |
| `data-spine-color` | Spine Color |
| `data-buy` | Amazon Purchase Link (affiliate amzn.to only) |
| `data-url` | Book page URL |
| `data-pages` | Optional. Page count; otherwise parsed from Short Details List in the demo build |

Inside each item: the card (`article.book-card`), a paragraph with attribute `data-desc` for the short description, a rich text block with `data-details`, and a block with `data-authors` holding one `.author` card per author. See `demo.html` for the exact markup.

## Shelf section markup

Copy the `<section id="shelf">` block and the view toggle from `demo.html` into an Embed, or rebuild them in the Designer with the same classes and data attributes. The `<html>` element gets `data-view` and `data-webgl` from the head snippet.

## Testing checklist

- Keyboard only: Tab to the toggle, the markers, Previous, Open, Next. Arrows, Home and End move the stack. Enter opens. Escape closes and focus returns.
- Screen reader: NVDA + Firefox, VoiceOver on macOS and iOS. Listen for the "title by author, n of total" status.
- Reduced motion on: cuts, no glide or turn.
- 200% and 400% zoom, 320px wide: no horizontal scroll.
- `?nowebgl`: list only, toggle hidden.

## Credits

Interaction model studied from [Stripe Press](https://press.stripe.com) and [MengTo/complete-shelf](https://github.com/MengTo/complete-shelf); this is an original implementation. three.js 0.186.0 (MIT).
