# ClickBlock: Custom Element Remover / 網頁任意門

A localization-ready, clean Chrome extension designed to permanently remove any unwanted elements or ads on any website. Simply click to block and the extension remembers your choice next time you open the same webpage.

## Features

- **Point & Click Hiding**: Toggle selection mode, hover over any element to highlight, and click to remove it.
- **Dynamic Pre-rendering Stylesheet**: Hidden elements are injected at `document_start` to prevent layout flashing/shifts.
- **Rules Management**: View and delete active blocking rules per domain directly from the popup.
- **Backup & Share (Import/Export)**: Easily export all rules to a JSON file or import rules from other devices.
- **Fully Localized**: English and Traditional Chinese support built-in.
- **Minimal Permissions**: Uses only `storage` permission, making Chrome Web Store reviews much faster.

---

## Chrome Web Store Publishing Guide

### Step 1: Prepare assets and package
1. Make sure you have the following folder structure:
   - `_locales/`
     - `en/messages.json`
     - `zh_TW/messages.json`
   - `icons/`
     - `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
   - `manifest.json`
   - `content.js`
   - `popup.html`
   - `popup.js`
2. Compress all files inside the root directory (excluding `generate_icons.ps1` and `README.md`) into a single `.zip` file.
   - *Tip*: On Windows, select `_locales`, `icons`, `manifest.json`, `content.js`, `popup.html`, and `popup.js`, right-click, select **Compress to ZIP file**, and name it `clickblock.zip`.

### Step 2: Register Developer Account
1. Open the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
2. Sign in with a Google account.
3. Pay the one-time developer registration fee ($5 USD).

### Step 3: Create & Upload the Extension
1. Click **+ New Item** in the console.
2. Upload the `clickblock.zip` file you created in Step 1.

### Step 4: Fill in Store Listing Details
1. **Description**: Describe how the extension works. Explain that it provides custom item hiding and element blocker functionality.
2. **Store Assets**:
   - Upload screenshots (at least one 1280x800 or 640x400 image is required).
   - Upload a promo tile image (optional but recommended).
3. **Category**: Select **Productivity** or **Developer Tools**.

### Step 5: Configure Privacy Practice & Submit
1. **Single Purpose**: State that the extension has a single purpose: "To allow users to select and permanently block/hide HTML elements on web pages."
2. **Permissions Justification**:
   - `storage`: Explain that it is used to save user-defined selectors (blocking rules) for different websites.
3. **Data Usage**: Declare that your extension does not collect or transmit user data.
4. Click **Submit for Review**. Reviews for extensions with only `storage` permission are usually approved within 1-3 business days.
