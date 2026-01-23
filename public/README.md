# Public Assets Folder

This folder contains static assets that are served at the root path.

## Audio Files

Place your audio files (MP3) here to use them as default audio in presets.

### Example Usage

1. Place an audio file here, e.g., `default-audio.mp3`
2. In your preset JSON, reference it with:
   ```json
   {
     "type": "audio-file-input",
     "parameters": {
       "filePath": "/default-audio.mp3",
       "autoPlay": 1
     }
   }
   ```

### Path Notes

- Files in this folder are served at the root path `/`
- If your Vite config has a `base` path (like `/shader-composer/`), you may need to include it in the path
- For development: use `/filename.mp3`
- For production with base path: use `/shader-composer/filename.mp3` or use a relative path

### Automatic Loading

Files referenced in presets will be automatically loaded when the graph is set, without requiring user interaction.
