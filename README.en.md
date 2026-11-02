# asmr.one plus

[简体中文](./README.md) | English

A userscript for asmr.one that saves playback progress and adds listening history, local follows, and data management.

Current version: **1.0.0**

The interface follows the website's language setting and supports Simplified Chinese, Japanese, and English.

## Features added by the script

### Playback progress

Saves the playback position of each audio track and resumes from that position the next time it plays. Progress is saved every 5 seconds during playback, and immediately when pausing, switching tracks, or leaving the page.

### Listening history

A work is added to history as soon as playback starts. History keeps the 200 most recent works and lets you resume playback, remove individual records, or clear the history.

### Local follows

Follow voice actors, tags, and circles you discover while listening, then return to their related works through **Following**. Supports groups, batch entry, and sorting by work count. Separate multiple names with semicolons when adding them in batches.

### Data management

Adds a dedicated **Data management** page for exporting and importing follows, history, and playback progress, clearing all playback progress, or clearing all script data.

## Website interface adjustments

Some website labels do not clearly describe their purpose: **Playlists** stores collections of works, while **My Favourites** brings together ratings, reviews, and listening statuses. The script renames them to reflect their actual use:

- **Playlists** becomes **Collections**, for saving and organizing works.
- **My Favourites** becomes **My Marks**, for ratings, reviews, and statuses such as wanting to listen, listening, and having listened.

A confirmation is added before removing a work from a collection to reduce accidental removal.

Hover hints are added to the player's bottom-row icons to explain the playback queue, playback mode, desktop subtitles, subtitle selection, and additional actions.

## Installation and updates

1. Install and enable Tampermonkey. Follow your browser's instructions to enable userscripts.
2. Download [asmr-one-plus.user.js](./asmr-one-plus.user.js), import it through **Utilities** in the Tampermonkey dashboard, and confirm installation.
3. Refresh the website. **Following**, **History**, and **Data management** will appear in the sidebar.

Updates are currently manual. Export a backup first, then install the new version over the existing script without uninstalling it.

## Data

- Follows, history, and playback progress are stored locally in the userscript manager and are not automatically uploaded. Website accounts using the same installed script share this data. Use backup files to transfer data between browsers or devices.
- History and playback progress can be cleared independently. You can clear an individual track's progress from the audio list; other formats of the same track are cleared together. Clearing the current track's progress pauses it and returns it to the beginning.
- Backups contain personal listening records but no login tokens. Export a backup before uninstalling the script or clearing extension data.

## Development

Requires Node.js 22 or later:

```sh
npm ci
npm run build
```

Source files are in `src/`. The build generates `asmr-one-plus.user.js` in the project root; this is the only file needed for installation. Maintain the version and userscript configuration in `package.json`.

Reference: [asmr.one technology stack](./docs/site-stack.md).
