# Chrome Web Store listing

## Store listing tab

**Name** (from manifest): Inbuilt Video Editor for X (Twitter)

**Summary** (from manifest): iPhone-style trim & crop built into the X / Twitter post composer. Fast, private export — nothing leaves your machine.

**Category:** Social Networking   **Language:** English

**Description:**

X on the web has no video editor. This adds one, right inside the post composer.

Attach a video like normal, press the new "Edit video" button next to GIF, trim and crop it, then press Done. The edited clip replaces the one in your post.

FEATURES
• Trim with a filmstrip and drag handles. Hold the middle of the selection to slide it, tap to jump, or drag the playhead to scrub.
• Crop freeform or to Original, 16:9, Square, 4:5 or 9:16
• Mute the sound
• Fast export to an H.264 MP4 that X accepts, usually in a few seconds
• Works with iPhone videos, including HEVC and portrait clips
• Warns when a clip is over X's 2:20 limit for non-Premium accounts
• Click the toolbar icon to use the editor on its own page and download the MP4

PRIVATE BY DESIGN
Everything happens in your browser. The extension requests no permissions, makes no network requests and collects no data.

Open source: https://github.com/danialbka/twitter-editor-inbuilt

Not affiliated with or endorsed by X Corp.

**Graphic assets** (all in `store/`):
- Store icon: `icon128.png`
- Screenshots, 1280×800, in order: `1-button.png`, `2-trim.png`, `3-crop.png`, `4-export.png`
- Small promo tile (required): `promo-440x280.png`
- Marquee promo tile (optional): `marquee-1400x560.png`
- Promo video (optional): `promo-video.mp4`, 50s at 1280×800. The store only accepts a YouTube link, so upload this to YouTube first (unlisted is fine) and paste the URL.

**Homepage URL:** https://github.com/danialbka/twitter-editor-inbuilt
**Support URL:** https://github.com/danialbka/twitter-editor-inbuilt/issues

## Privacy practices tab

**Single purpose:** Lets users trim and crop a video inside the X (Twitter) post composer before posting it.

**Host permission justification** (content script on x.com and twitter.com): The content script adds an "Edit video" button to the X post composer, opens the editor over the page, and puts the edited clip into the composer's own file input. It runs only on x.com and twitter.com, and does not read or send any page data.

**Remote code:** No, I am not using remote code. All code, including the mediabunny library, is included in the package.

**Data usage:** Collects none of the listed data types. Tick all three certifications (no selling data, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL:** https://github.com/danialbka/twitter-editor-inbuilt/blob/main/PRIVACY.md

## Distribution tab

Free; Public; all regions.
